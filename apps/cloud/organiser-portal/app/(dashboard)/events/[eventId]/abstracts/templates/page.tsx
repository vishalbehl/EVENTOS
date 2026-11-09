"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FormTemplateGallery,
  FormTemplate,
  FormCategory,
  FormRenderer,
  FormField,
  FormSettings,
  abstractSchemaForSave,
} from "@eventos/form-builder-studio";
import { ScopedEventEditor } from "@/components/organizer/events/ScopedEventEditor";
import { ScopedCommandFeedback } from "@/components/organizer/events/ScopedCommandFeedback";
import { useEventTemplateCopy } from "@/hooks/useEventTemplateCopy";
import { organiserFormService } from "@/services/form-template-service";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import { apiGet } from "@/lib/api-client";
import { AbstractForm } from "@/hooks/useAbstractWorkflow";
import { 
  RefreshCw, Plus, Edit3, Layers, CheckCircle2, 
  ArrowRight, X, Eye, Sparkles 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCataloguePageRequests } from "@/hooks/useCataloguePageRequests";
import { appendCataloguePage, nextCatalogueCursor } from "@/lib/catalogue-pages";

export default function OrganiserAbstractFormTemplatesPage() {
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
  const [activeAbstractForm, setActiveAbstractForm] = useState<AbstractForm | null>(null);
  const [applying, setApplying] = useState(false);
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
        organiserFormService.listTemplatePage({ category_key: "abstract", event_id: eventId, page_size: "50" }, signal),
        apiGet<AbstractForm>(`/events/${eventId}/abstracts/form`, { signal }),
      ]), ([cats, tpls, activeForm]) => {
      const categoryCursor = nextCatalogueCursor(cats);
      const templateCursor = nextCatalogueCursor(tpls);
      setCategories(appendCataloguePage([], cats.items || []));
      setNextCategoryCursor(categoryCursor);
      setTemplates(appendCataloguePage([], tpls.items || []));
      setNextTemplateCursor(templateCursor);
      setActiveAbstractForm(activeForm);

      if (activeForm && (activeForm.schema as any)?.template_id) {
        setActiveTemplateId(String((activeForm.schema as any).template_id));
      } else {
        setActiveTemplateId("");
      }
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
    await readPage("templates", signal => organiserFormService.listTemplatePage({ category_key: "abstract",
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
    if (!eventId || loading || readFailure.initial || loadError || applying || copy.pending) return;
    if (!activeAbstractForm) {
      toast.error("Reload the active abstract form before applying a template.");
      return;
    }
    setApplying(true);
    try {
      const target = copy.selectTarget(template, templates);
      const updated = await copy.execute<AbstractForm>("put", `/events/${eventId}/abstracts/form`, {
        title: template.name,
        schema: abstractSchemaForSave({ ...activeAbstractForm.schema, fields: template.fields || [], settings: template.settings || {} }),
        source_template_id: target.id,
        source_version: target.version,
        is_active: true,
        publish: true,
      }, activeAbstractForm.version);
      if (!updated || !copy.isCurrent()) return;
      const copied = updated.saved_template;
      if (!copied) throw new Error("The save did not return its committed template.");
      setActiveAbstractForm(updated);
      setTemplates(current => [...current.filter(item => item.id !== copied.id), copied]);
      setActiveTemplateId(copied.id);
      toast.success(`"${template.name}" applied as active default for abstract submissions! 🎉`);
    } catch (err: any) {
      if (!copy.isCurrent()) return;
      toast.error(err.message || "Failed to fetch and apply template");
    } finally {
      if (copy.isCurrent()) setApplying(false);
    }
  };

  const handleEditTemplate = (template?: FormTemplate | null) => {
    if (!eventId) return;
    const tid = template?.id || activeTemplateId || "";
    router.push(`/events/${eventId}/abstracts/form-builder${tid ? `?templateId=${tid}` : ""}`);
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
        category_key: "abstract",
        description: data.description,
        fields: [],
      });
      if (!created || !copy.isCurrent()) return false;
      toast.success("Created custom abstract submission template!");
      if (created && created.id) {
        router.push(`/events/${eventId}/abstracts/form-builder?templateId=${created.id}`);
      } else {
        loadData();
      }
    } catch (err: any) {
      if (copy.isCurrent()) toast.error(err.message || "Failed to create custom template");
      return false;
    }
  };

  const activeTemplate = useMemo(() => {
    if (activeTemplateId) {
      const found = templates.find(
        (t) =>
          t.id === activeTemplateId ||
          t.slug === activeTemplateId ||
          (t.settings as any)?._source_template_id === activeTemplateId
      );
      if (found) return found;
    }
    return null;
  }, [activeTemplateId, templates]);

  // Robust field resolution ensuring valid FormField objects with is_active: true
  const activeFormFields: FormField[] = useMemo(() => {
    const rawActiveFields = (activeAbstractForm?.schema as any)?.fields;
    const isRichList =
      Array.isArray(rawActiveFields) &&
      rawActiveFields.length > 0 &&
      typeof rawActiveFields[0] === "object" &&
      rawActiveFields[0]?.type;

    const sourceList: any[] = isRichList
      ? rawActiveFields
      : [];

    return sourceList.map((f: any, idx: number) => ({
      id: f?.id ? String(f.id) : `field_${idx + 1}`,
      type: f?.type || "text",
      label: f?.label || f?.name || `Question ${idx + 1}`,
      name: f?.name || f?.key || f?.id || `field_${idx + 1}`,
      is_required: Boolean(f?.is_required),
      is_active: f?.is_active !== false, // Crucial for FormRenderer activeFields filter
      is_default: Boolean(f?.is_default),
      placeholder: f?.placeholder || "",
      help_text: f?.help_text || "",
      options: Array.isArray(f?.options) ? f.options : undefined,
      grid_width: f?.grid_width || "full",
      category: f?.category || "basic",
      sort_order: f?.sort_order ?? idx,
    }));
  }, [activeAbstractForm]);

  const activeFormSettings: FormSettings = useMemo(() => {
    const custom = (activeAbstractForm?.schema as any)?.settings;
    if (custom && Object.keys(custom).length > 0) return custom;
    return {};
  }, [activeAbstractForm]);

  const activeFormTitle =
    activeAbstractForm?.title || activeTemplate?.name || "Abstract form unavailable";
  const activeFormDescription =
    activeTemplate?.description || "No committed abstract form is currently available for this event.";

  return (
    <OrganiserPage
      title="Abstract Submission Form"
      description="View and configure the author intake questionnaire. Custom changes made here or in the designer are live on the Author Submission portal."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsLibraryOpen(true)}
            className="h-8 text-xs font-bold gap-1.5 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 cursor-pointer shadow-sm"
          >
            <Layers className="size-3.5" />
            Show Form Templates
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/events/${eventId}/abstracts/form-builder`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            <Plus className="size-3.5" />
            Create Blank Form
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={loading || copy.pending || applying}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
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
        <div className="p-16 flex flex-col items-center justify-center space-y-3 text-center rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <RefreshCw className="size-8 text-[var(--pri)] animate-spin" />
          <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Loading Form Configuration...
          </p>
        </div>
      ) : activeFormFields.length > 0 ? (
        /* ── Side-by-Side: Active Template Details on Left, Live Form Preview on Right ── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (5 cols): Template Details & Actions */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-6">
              <div className="space-y-3 pb-5 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                    Abstract Submission Form
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="size-3" />
                    Active Default on Author Portal
                  </span>
                </div>

                <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                  {activeFormTitle}
                </h2>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {activeFormDescription}
                </p>

                {/* Action Buttons: Edit in Designer & Browse Library */}
                <div className="flex items-center gap-2.5 pt-2">
                  <Button
                    onClick={() => handleEditTemplate(activeTemplate)}
                    className="h-9 px-4 text-xs font-bold gap-1.5 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 cursor-pointer shadow-sm"
                  >
                    <Edit3 className="size-3.5" />
                    <span>Edit in Designer</span>
                    <ArrowRight className="size-3.5" />
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setIsLibraryOpen(true)}
                    className="h-9 px-3.5 text-xs font-semibold gap-1.5 border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  >
                    <Layers className="size-3.5 text-[var(--pri)]" />
                    <span>Change Template</span>
                  </Button>
                </div>
              </div>

              {/* Questions & Blueprint Attributes */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-tertiary)]">Total Questions</span>
                  <p className="text-lg font-black text-[var(--text-primary)]">
                    {activeFormFields.length}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-tertiary)]">Required Fields</span>
                  <p className="text-lg font-black text-[var(--pri)]">
                    {activeFormFields.filter((f) => f.is_required).length}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-tertiary)]">Form Scope</span>
                  <p className="text-xs font-bold text-[var(--text-primary)] mt-1">
                    Event Peer-Review Intake
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-tertiary)]">Author Portal</span>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Live &amp; Linked
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (7 cols): Live Form Interactive Preview Window */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border-default)] bg-[var(--bg-surface-2)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
                    <Eye className="size-3.5 text-[var(--pri)]" />
                    Live Form Preview
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-tertiary)] font-medium">
                  Author Submission View
                </span>
              </div>
              <div className="p-6 max-h-[750px] overflow-y-auto bg-[var(--bg-surface)]">
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
        <div className="p-16 border-2 border-dashed border-[var(--border-default)] rounded-2xl text-center space-y-4 bg-[var(--bg-surface)] max-w-2xl mx-auto">
          <Layers className="size-12 text-[var(--pri)] mx-auto opacity-70" />
          <div>
            <h4 className="text-base font-bold text-[var(--text-primary)]">No Abstract Template Selected</h4>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mt-1">
              No abstract form is bound to this event. Choose a template to update the versioned abstract-form aggregate.
            </p>
          </div>
          <Button
            onClick={() => setIsLibraryOpen(true)}
            className="h-9 px-4 text-xs font-bold gap-1.5 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 shadow-sm cursor-pointer"
          >
            <Layers className="size-3.5" />
            Show Form Templates
          </Button>
        </div>
      )}

      {/* ── Dialogue Pop-up Window: Template Library ── */}
      {isLibraryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-5xl max-h-[90vh] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="h-16 border-b border-[var(--border-default)] px-6 flex items-center justify-between shrink-0 bg-[var(--bg-surface)]">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center">
                  <Layers className="size-5 text-[var(--pri)]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">Abstract Submission Template Library</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Preview and fetch peer-review submission blueprints. Fetching copies the design for this event and activates it as default.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLibraryOpen(false)}
                className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] transition cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-surface-2)]">
              <FormTemplateGallery
                templates={templates}
                categories={categories}
                facilityCategory="abstract"
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
