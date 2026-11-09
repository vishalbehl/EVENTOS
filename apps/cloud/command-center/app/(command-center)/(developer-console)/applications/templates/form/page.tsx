"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormTemplateGallery, FormTemplate, FormCategory } from "@eventos/form-builder-studio";
import { AggregateReconciliationIssue, CatalogueReconciliationIssue, CategoryReconciliationIssue, platformFormService } from "@/services/form-template-service";
import { RefreshCw } from "lucide-react";
import { useCatalogueCommand } from "@/hooks/useCatalogueCommand";
import { useAuthStore } from "@/store/use-auth-store";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { catalogueCompletion } from "@/lib/catalogue-reconciliation-progress";
import { appendCataloguePage, nextCatalogueCursor } from "@/lib/catalogue-pages";
import { useCatalogueReadController } from "@/hooks/useCatalogueReadController";

export default function CommandCenterFormTemplatesPage() {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <p role="status">Sign in to manage the catalogue.</p>;
  return <CataloguePage key={`${user?.id}:${user?.organization_id}`} />;
}

function CataloguePage() {
  const router = useRouter();
  const command = useCatalogueCommand();
  const { run: runRead, invalidate: invalidateReads, pending: readPending, blocked: readBlocked,
    coolingDown: readCoolingDown, failure: readFailure, retryAt: readRetryAt } = useCatalogueReadController(command.isCurrent);
  const repairedTemplates = useRef(new Map<string, number>());
  const repairedAggregates = useRef(new Map<string, number>());
  const visibleTemplateIssues = useCallback((items: CatalogueReconciliationIssue[]) => items.filter(
    item => item.template_version >= (repairedTemplates.current.get(item.template_id) ?? 0)), []);
  const visibleAggregateIssues = useCallback((items: AggregateReconciliationIssue[]) => items.filter(
    item => item.resource_version >= (repairedAggregates.current.get(`${item.resource_type}:${item.resource_id}`) ?? 0)), []);
  const visibleCategoryIssues = useCallback((items: CategoryReconciliationIssue[]) => items.filter(
    item => item.category_version >= (repairedAggregates.current.get(`FORM_CATEGORY:${item.category_id}`) ?? 0)), []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [categories, setCategories] = useState<FormCategory[]>([]);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [retiringId, setRetiringId] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const [retirementReason, setRetirementReason] = useState("");
  const [retiringCategoryId, setRetiringCategoryId] = useState("");
  const [replacementCategoryId, setReplacementCategoryId] = useState("");
  const [categoryRetirementReason, setCategoryRetirementReason] = useState("");
  const [nextTemplateCursor, setNextTemplateCursor] = useState<string | null>(null);
  const [nextCategoryCursor, setNextCategoryCursor] = useState<string | null>(null);
  const [blockedIssues, setBlockedIssues] = useState<CatalogueReconciliationIssue[]>([]);
  const [blockedAggregateIssues, setBlockedAggregateIssues] = useState<AggregateReconciliationIssue[]>([]);
  const [blockedCategoryIssues, setBlockedCategoryIssues] = useState<CategoryReconciliationIssue[]>([]);
  const [nextBlockedTemplateCursor, setNextBlockedTemplateCursor] = useState<string | null>(null);
  const [nextBlockedRegistrationCursor, setNextBlockedRegistrationCursor] = useState<string | null>(null);
  const [nextBlockedAbstractCursor, setNextBlockedAbstractCursor] = useState<string | null>(null);
  const [nextBlockedRubricCursor, setNextBlockedRubricCursor] = useState<string | null>(null);
  const [nextBlockedTenantCategoryCursor, setNextBlockedTenantCategoryCursor] = useState<string | null>(null);
  const [nextBlockedCategoryCursor, setNextBlockedCategoryCursor] = useState<string | null>(null);
  const [reconciliationStatus, setReconciliationStatus] = useState<string | null>(null);
  const [rubricRepair, setRubricRepair] = useState<{
    issue: AggregateReconciliationIssue; documentText: string; reason: string;
  } | null>(null);
  const [rubricRepairError, setRubricRepairError] = useState<string | null>(null);
  const [blueprintRepair, setBlueprintRepair] = useState<{
    issue: CatalogueReconciliationIssue;
    categoryId: string;
    categoryLabel?: string;
    documentText: string;
    reason: string;
    detachInvalidLineage: boolean;
  } | null>(null);
  const [categoryRepair, setCategoryRepair] = useState<{
    issue: Pick<AggregateReconciliationIssue, "resource_id" | "resource_version">;
    name: string;
    slug: string;
    description: string;
    icon: string;
    sortOrder: string;
    reason: string;
  } | null>(null);
  const loading = readPending.has("initial") || readPending.has("templates") || readPending.has("categories");

  const loadData = useCallback(async () => {
    setLoadError(null);
    setTemplateError(null);
    await runRead("initial", signal => Promise.all([
        platformFormService.listCategoryPage({ page_size: 100 }, signal),
        platformFormService.listTemplatePage({ page_size: 50 }, signal)
          .then(page => ({ page, error: null as unknown }))
          .catch((error: unknown) => ({ page: { items: [] as FormTemplate[], has_next: false, next_cursor: null }, error })),
        platformFormService.listBlockedReconciliations({ page_size: 100 }, signal),
        platformFormService.listBlockedAggregateReconciliations("REGISTRATION_FORM", { page_size: 100 }, signal),
        platformFormService.listBlockedAggregateReconciliations("ABSTRACT_FORM", { page_size: 100 }, signal),
        platformFormService.listBlockedAggregateReconciliations("FORM_CATEGORY", { page_size: 100 }, signal),
        platformFormService.listBlockedCategoryReconciliations({ page_size: 100 }, signal),
        platformFormService.listBlockedAggregateReconciliations("PROGRAMME_RUBRIC", { page_size: 100 }, signal),
      ]), ([catsRes, templateResult, issuesRes, registrationIssues, abstractIssues, tenantCategoryIssues, categoryIssues, rubricIssues]) => {
      const tplsRes = templateResult.page;
      const categoryCursor = nextCatalogueCursor(catsRes);
      const templateCursor = nextCatalogueCursor(tplsRes);
      const blockedTemplateCursor = nextCatalogueCursor(issuesRes);
      const blockedRegistrationCursor = nextCatalogueCursor(registrationIssues);
      const blockedAbstractCursor = nextCatalogueCursor(abstractIssues);
      const blockedTenantCategoryCursor = nextCatalogueCursor(tenantCategoryIssues);
      const blockedCategoryCursor = nextCatalogueCursor(categoryIssues);
      const blockedRubricCursor = nextCatalogueCursor(rubricIssues);
      setTemplateError(templateResult.error instanceof Error ? templateResult.error.message
        : templateResult.error ? "Templates unavailable." : null);
      setCategories(appendCataloguePage([], catsRes.items || []));
      setNextCategoryCursor(categoryCursor);
      setTemplates(appendCataloguePage([], tplsRes.items || []));
      setNextTemplateCursor(templateCursor);
      setBlockedIssues(visibleTemplateIssues(issuesRes.items || []));
      setBlockedAggregateIssues(visibleAggregateIssues([...(registrationIssues.items || []), ...(abstractIssues.items || []),
        ...(tenantCategoryIssues.items || []), ...(rubricIssues.items || [])]));
      setBlockedCategoryIssues(visibleCategoryIssues(categoryIssues.items || []));
      setNextBlockedTemplateCursor(blockedTemplateCursor);
      setNextBlockedRegistrationCursor(blockedRegistrationCursor);
      setNextBlockedAbstractCursor(blockedAbstractCursor);
      setNextBlockedRubricCursor(blockedRubricCursor);
      setNextBlockedTenantCategoryCursor(blockedTenantCategoryCursor);
      setNextBlockedCategoryCursor(blockedCategoryCursor);
      setInitialLoadComplete(true);
    }, (error: unknown) => {
      setCategories([]);
      setTemplates([]);
      setLoadError(error instanceof Error ? error.message : "Catalogue unavailable. Reload before making changes.");
      setInitialLoadComplete(true);
    }, { refresh: true });
  }, [runRead, visibleTemplateIssues, visibleAggregateIssues, visibleCategoryIssues]);

  const acknowledgeRepair = (value: unknown, field: "template_id" | "resource_id", id: string, version: number,
    resourceType?: AggregateReconciliationIssue["resource_type"]) => {
    const result = value && typeof value === "object" ? value as Record<string, unknown> : null;
    if (!result || result[field] !== id || result.previous_version !== version || result.version !== version + 1
      || result.status !== "REPAIRED" || field === "resource_id" && result.resource_type !== resourceType) {
      throw new Error("The correction response did not match this record. Reload before making another change.");
    }
    invalidateReads();
    if (field === "template_id") {
      repairedTemplates.current.set(id, version + 1);
      setBlockedIssues(current => visibleTemplateIssues(current));
    } else {
      repairedAggregates.current.set(`${resourceType}:${id}`, version + 1);
      setBlockedAggregateIssues(current => visibleAggregateIssues(current));
      if (resourceType === "FORM_CATEGORY") setBlockedCategoryIssues(current => visibleCategoryIssues(current));
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectTemplate = (template: FormTemplate) => {
    router.push(`/applications/templates/form/builder?id=${template.id}`);
  };

  const handleCreateCustomTemplate = async (data: { name: string; category_key: string; description: string }) => {
    if (templateError || loadError || loading || command.pending) {
      toast.error("Reload the template catalogue before creating a template.");
      return false;
    }
    try {
      const res = await command.execute<FormTemplate>("post", "/platform/forms/templates", {
        name: data.name,
        category_key: data.category_key,
        description: data.description,
        scope_type: "GLOBAL",
        is_default: false,
        fields: [],
      });
      if (!res || !command.isCurrent()) return false;
      toast.success("Created new form template blueprint!");
      router.push(`/applications/templates/form/builder?id=${res.id}`);
    } catch (err: any) {
      if (command.isCurrent()) toast.error(err.message || "Failed to create template");
      return false;
    }
  };

  const handleCreateCategory = async (name: string, description: string) => {
    try {
      const created = await command.execute<FormCategory>("post", "/platform/forms/categories", { name, description });
      if (!created || !command.isCurrent()) return;
      setCategories(current => [...current.filter(item => item.id !== created.id), created]);
      toast.success("Created new form category");
    } catch (err: any) {
      if (!command.isCurrent()) return;
      toast.error(err.message || "Failed to create category");
      return false;
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const category = categories.find(item => item.id === id);
    if (category?.is_system) {
      setRetiringCategoryId(id);
      setReplacementCategoryId("");
      toast.info("Global categories must be replaced through the lifecycle controls.");
      return;
    }
    try {
      if (!category?.version) throw new Error("Reload the persisted category before deleting.");
      await command.execute<void>("delete", `/platform/forms/categories/${id}`, undefined, category.version);
      if (!command.isCurrent()) return;
      setCategories(current => current.filter(item => item.id !== id));
      toast.success("Category deleted");
    } catch (err: any) {
      if (!command.isCurrent()) return;
      toast.error(err.message || "Failed to delete category");
    }
  };

  const handleCategoryRetire = async () => {
    const source = categories.find(item => item.id === retiringCategoryId);
    if (!source?.version || !replacementCategoryId || categoryRetirementReason.trim().length < 8) {
      toast.error("Choose a replacement category and provide a clear retirement reason.");
      return;
    }
    try {
      await command.execute("post", `/platform/forms/categories/${source.id}/retire`, {
        replacement_category_id: replacementCategoryId,
        reason: categoryRetirementReason.trim(),
      }, source.version);
      if (!command.isCurrent()) return;
      toast.success("Category retired and known references reassigned.");
      setRetiringCategoryId("");
      setReplacementCategoryId("");
      setCategoryRetirementReason("");
      await loadData();
    } catch (error: unknown) {
      if (command.isCurrent()) toast.error(error instanceof Error ? error.message : "Category was not retired.");
    }
  };

  const handleRetire = async () => {
    const source = templates.find(item => item.id === retiringId);
    if (!source?.version || !replacementId || retirementReason.trim().length < 8) {
      toast.error("Choose a replacement and provide a clear retirement reason.");
      return;
    }
    try {
      await command.execute("post", `/platform/forms/templates/${source.id}/retire`, {
        replacement_template_id: replacementId,
        reason: retirementReason.trim(),
      }, source.version);
      if (!command.isCurrent()) return;
      toast.success("Blueprint retired and active references reassigned.");
      setRetiringId("");
      setReplacementId("");
      setRetirementReason("");
      await loadData();
    } catch (problem: unknown) {
      if (command.isCurrent()) toast.error(problem instanceof Error ? problem.message : "Blueprint was not retired.");
    }
  };

  const handleReconcile = async () => {
    try {
      const scheduled = await command.execute<{ run_id: string; status: "SCHEDULED" }>(
        "post", "/platform/forms/templates/reconciliation-runs",
        { reason: "Operator requested complete registration, abstract, rubric, and taxonomy reconciliation." },
      );
      if (scheduled) setReconciliationStatus(
        `Bounded whole-cohort reconciliation scheduled as ${scheduled.run_id}.`,
      );
      if (scheduled) toast.success("Whole-cohort reconciliation was scheduled.");
      if (scheduled) {
        let terminalObserved = false;
        for (let attempt = 0; attempt < 60 && command.isCurrent(); attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 2000));
          let current;
          try {
            current = await platformFormService.getReconciliationRun(scheduled.run_id);
          } catch {
            if (command.isCurrent()) {
              setReconciliationStatus(
                `Reconciliation ${scheduled.run_id} is still scheduled; status is temporarily unavailable. Monitoring will continue.`,
              );
            }
            continue;
          }
          if (!command.isCurrent()) return;
          setReconciliationStatus(`Reconciliation ${scheduled.run_id}: ${current.status.toLowerCase().replaceAll("_", " ")}; ${current.streams_completed ?? 0}/${current.streams_total ?? 0} streams and ${current.pages_completed ?? 0} pages processed.`);
          const completion = catalogueCompletion(current);
          if (completion === "FAILED") {
            throw new Error(current.status === "FAILED"
              ? `Reconciliation dispatch failed (${current.failure_code || "unknown failure"}).`
              : "A durable reconciliation page failed. Check the worker failure and request an authorised rerun.");
          }
          if (completion === "LEGACY_UNTRACKED") {
            terminalObserved = true;
            setReconciliationStatus(`Legacy run ${scheduled.run_id} has no durable page completion evidence. Start a new reviewed run.`);
            break;
          }
          if (completion === "COMPLETED") {
            terminalObserved = true;
            setReconciliationStatus(
              `Reconciliation ${scheduled.run_id} processed ${current.pages_completed} pages across ${current.streams_completed} streams; ${current.blocked_count} blocked document observations require review.`,
            );
            await loadData();
            break;
          }
        }
        if (!terminalObserved && command.isCurrent()) {
          setReconciliationStatus(
            `Reconciliation ${scheduled.run_id} remains durable and will continue in the background. Status monitoring timed out; reload to review results.`,
          );
        }
      }
    } catch (problem: unknown) {
      if (command.isCurrent()) toast.error(problem instanceof Error ? problem.message : "Reconciliation did not complete.");
    }
  };

  const loadMoreTemplates = async () => {
    const cursor = nextTemplateCursor;
    if (!cursor) return;
    await runRead("templates", signal => platformFormService.listTemplatePage({ page_size: 50, cursor }, signal), page => {
      const next = nextCatalogueCursor(page, cursor);
      setTemplates(current => appendCataloguePage(current, page.items || []));
      setNextTemplateCursor(next);
    }, error => toast.error(error instanceof Error ? error.message : "More blueprints could not be loaded."));
  };

  const loadMoreCategories = async () => {
    const cursor = nextCategoryCursor;
    if (!cursor) return;
    await runRead("categories", signal => platformFormService.listCategoryPage({ page_size: 100, cursor }, signal), page => {
      const next = nextCatalogueCursor(page, cursor);
      setCategories(current => appendCataloguePage(current, page.items || []));
      setNextCategoryCursor(next);
    }, error => toast.error(error instanceof Error ? error.message : "More categories could not be loaded."));
  };

  const replaceBlockedWithEmptyDocument = async (issue: CatalogueReconciliationIssue) => {
    if (!window.confirm(`Replace the invalid saved document for ${issue.template_name} with an empty safe blueprint?`)) return;
    try {
      const result = await command.execute("post", `/platform/forms/templates/${issue.template_id}/reconcile`, {
        document: { fields: [], settings: {} },
        reason: "Operator approved replacement of an invalid historical document with a safe empty blueprint.",
      }, issue.template_version);
      if (!result || !command.isCurrent()) return;
      acknowledgeRepair(result, "template_id", issue.template_id, issue.template_version);
      toast.success("Blocked document replaced with a valid empty blueprint.");
      await loadData();
    } catch (error: unknown) {
      if (command.isCurrent()) toast.error(error instanceof Error ? error.message : "Blocked document was not repaired.");
    }
  };

  const submitBlueprintRepair = async () => {
    if (!blueprintRepair || command.pending) return;
    const reason = blueprintRepair.reason.trim();
    if (reason.length < 8) {
      toast.error("Explain the reviewed correction in at least eight characters.");
      return;
    }
    let document: unknown;
    try {
      document = JSON.parse(blueprintRepair.documentText);
    } catch {
      toast.error("Enter a valid JSON document with fields and settings.");
      return;
    }
    try {
      const result = await command.execute("post",
        `/platform/forms/templates/${blueprintRepair.issue.template_id}/reconcile`, {
          document, reason,
          ...(blueprintRepair.categoryId ? { replacement_category_id: blueprintRepair.categoryId } : {}),
          ...(blueprintRepair.detachInvalidLineage ? { detach_invalid_source_lineage: true } : {}),
        }, blueprintRepair.issue.template_version);
      if (!result || !command.isCurrent()) return;
      acknowledgeRepair(result, "template_id", blueprintRepair.issue.template_id, blueprintRepair.issue.template_version);
      setBlueprintRepair(null);
      toast.success("Reviewed document and category correction committed.");
      await loadData();
    } catch (error: unknown) {
      if (command.isCurrent()) toast.error(error instanceof Error ? error.message : "Blueprint correction was not committed.");
    }
  };

  const replaceBlockedAggregate = async (issue: AggregateReconciliationIssue, detachInvalidReferences = false) => {
    if (issue.resource_type === "FORM_CATEGORY" || issue.resource_type === "PROGRAMME_RUBRIC") return;
    if (!window.confirm(detachInvalidReferences
      ? "Remove only invalid registration catalogue links and replace the saved document with an empty form? Valid links and audited history are preserved."
      : `Replace this invalid ${issue.resource_type.toLowerCase().replaceAll("_", " ")} with a safe empty document?`)) return;
    const document = issue.resource_type === "ABSTRACT_FORM"
      ? { fields: [], settings: {}, rubric: [] }
      : { fields: [], settings: {} };
    try {
      const result = await command.execute("post",
        `/platform/forms/templates/reconciliations/aggregates/${issue.resource_type}/${issue.resource_id}/repair`,
        { document, reason: detachInvalidReferences
          ? "Operator approved invalid registration reference removal and replacement with a safe empty document."
          : "Operator approved replacement of invalid historical configuration with a safe empty document.",
          ...(detachInvalidReferences ? { detach_invalid_registration_references: true } : {}) },
        issue.resource_version,
      );
      if (!result || !command.isCurrent()) return;
      acknowledgeRepair(result, "resource_id", issue.resource_id, issue.resource_version, issue.resource_type);
      toast.success("Blocked event form replaced with a valid empty document.");
      await loadData();
    } catch (error: unknown) {
      if (command.isCurrent()) toast.error(error instanceof Error ? error.message : "Blocked event form was not repaired.");
    }
  };

  const submitRubricRepair = async () => {
    if (!rubricRepair || command.pending) return;
    setRubricRepairError(null);
    try {
      const document: unknown = JSON.parse(rubricRepair.documentText);
      if (!document || typeof document !== "object" || Array.isArray(document)
          || Object.keys(document).length !== 1 || !("rubric" in document)
          || !Array.isArray(document.rubric) || document.rubric.length > 20
          || rubricRepair.reason.trim().length < 8) {
        throw new Error('Enter a reviewed JSON document containing only "rubric" (up to 20 criteria) and a clear review reason.');
      }
      const result = await command.execute("post",
        `/platform/forms/templates/reconciliations/aggregates/PROGRAMME_RUBRIC/${rubricRepair.issue.resource_id}/repair`,
        { document, reason: rubricRepair.reason.trim() }, rubricRepair.issue.resource_version);
      if (!result || !command.isCurrent()) return;
      acknowledgeRepair(result, "resource_id", rubricRepair.issue.resource_id,
        rubricRepair.issue.resource_version, "PROGRAMME_RUBRIC");
      setRubricRepair(null);
      toast.success("Reviewed rubric correction committed.");
      await loadData();
    } catch (error: unknown) {
      if (command.isCurrent()) setRubricRepairError(error instanceof Error
        ? error.message : "Rubric correction was not committed. Your proposal is preserved.");
    }
  };

  const submitCategoryRepair = async () => {
    if (!categoryRepair) return;
    const sortOrder = Number(categoryRepair.sortOrder);
    const normalizedSlug = categoryRepair.slug.trim();
    if (!categoryRepair.name.trim() || !/^[a-z0-9_-]{1,100}$/.test(normalizedSlug) ||
        !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000 ||
        categoryRepair.reason.trim().length < 8) {
      toast.error("Enter a valid name, lowercase slug, order and a clear review reason.");
      return;
    }
    try {
      const result = await command.execute("post",
        `/platform/forms/templates/reconciliations/aggregates/FORM_CATEGORY/${categoryRepair.issue.resource_id}/repair`,
        { document: {
          name: categoryRepair.name.trim(), slug: normalizedSlug,
          description: categoryRepair.description.trim() || null,
          icon: categoryRepair.icon.trim() || null, sort_order: sortOrder,
        }, reason: categoryRepair.reason.trim() },
        categoryRepair.issue.resource_version,
      );
      if (!result || !command.isCurrent()) return;
      acknowledgeRepair(result, "resource_id", categoryRepair.issue.resource_id, categoryRepair.issue.resource_version, "FORM_CATEGORY");
      setCategoryRepair(null);
      toast.success("Category correction was reviewed and committed.");
      await loadData();
    } catch (error: unknown) {
      if (command.isCurrent()) toast.error(error instanceof Error ? error.message : "Category correction was not committed.");
    }
  };

  const loadMoreBlockedTemplates = async () => {
    const cursor = nextBlockedTemplateCursor;
    if (!cursor || command.pending) return;
    await runRead("blockedTemplates", signal => platformFormService.listBlockedReconciliations({
      page_size: 100, cursor,
    }, signal), page => {
      const next = nextCatalogueCursor(page, cursor);
      setBlockedIssues(current => {
        const known = new Set(current.map(item => item.reconciliation_id));
        const additions = visibleTemplateIssues(page.items).filter(item => {
          if (known.has(item.reconciliation_id)) return false;
          known.add(item.reconciliation_id);
          return true;
        });
        return additions.length ? [...current, ...additions] : current;
      });
      setNextBlockedTemplateCursor(next);
    }, error => toast.error(error instanceof Error ? error.message : "More blocked blueprints could not be loaded."));
  };

  const loadMoreBlockedAggregates = async (resourceType: AggregateReconciliationIssue["resource_type"]) => {
    const cursor = resourceType === "REGISTRATION_FORM" ? nextBlockedRegistrationCursor
      : resourceType === "ABSTRACT_FORM" ? nextBlockedAbstractCursor
      : resourceType === "PROGRAMME_RUBRIC" ? nextBlockedRubricCursor
      : nextBlockedTenantCategoryCursor;
    if (!cursor || command.pending) return;
    const slot = `blocked${resourceType}`;
    await runRead(slot, signal => platformFormService.listBlockedAggregateReconciliations(resourceType, {
        page_size: 100, cursor,
      }, signal), page => {
      const next = nextCatalogueCursor(page, cursor);
      setBlockedAggregateIssues(current => {
        const known = new Set(current.map(item => item.reconciliation_id));
        const additions = visibleAggregateIssues(page.items).filter(item => {
          if (known.has(item.reconciliation_id)) return false;
          known.add(item.reconciliation_id);
          return true;
        });
        return [...current, ...additions];
      });
      if (resourceType === "REGISTRATION_FORM") {
        setNextBlockedRegistrationCursor(next);
      } else if (resourceType === "ABSTRACT_FORM") {
        setNextBlockedAbstractCursor(next);
      } else if (resourceType === "PROGRAMME_RUBRIC") {
        setNextBlockedRubricCursor(next);
      } else {
        setNextBlockedTenantCategoryCursor(next);
      }
    }, error => toast.error(error instanceof Error ? error.message : "More blocked event forms could not be loaded."));
  };

  const loadMoreBlockedCategories = async () => {
    const cursor = nextBlockedCategoryCursor;
    if (!cursor || command.pending) return;
    await runRead("blockedCategory", signal => platformFormService.listBlockedCategoryReconciliations({
      page_size: 100, cursor,
    }, signal), page => {
      const next = nextCatalogueCursor(page, cursor);
      setBlockedCategoryIssues(current => {
        const known = new Set(current.map(item => item.reconciliation_id));
        const additions = visibleCategoryIssues(page.items).filter(item => {
          if (known.has(item.reconciliation_id)) return false;
          known.add(item.reconciliation_id);
          return true;
        });
        return additions.length ? [...current, ...additions] : current;
      });
      setNextBlockedCategoryCursor(next);
    }, error => toast.error(error instanceof Error ? error.message : "More blocked categories could not be loaded."));
  };

  if (!initialLoadComplete) {
    return (
      <PageContainer className="p-0"><div className="p-12 flex flex-col items-center justify-center space-y-3 text-center min-h-[400px]">
        <RefreshCw className="size-8 text-[var(--pri,#4f46e5)] animate-spin" />
        <p className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider">
          Loading Form Blueprint Gallery...
        </p>
      </div></PageContainer>
    );
  }

  return (
    <PageContainer className="min-w-0 p-0"><div className="min-w-0 w-full p-6 max-w-7xl mx-auto">
      {loading ? <p role="status">Refreshing catalogue…</p> : null}
      {loadError ? <p role="alert">{loadError}</p> : null}
      {templateError ? <p role="alert">Template catalogue unavailable: {templateError}. Category administration remains separate.</p> : null}
      {command.failure ? <p role="alert">{command.failure.message}{command.failure.retryAfter ? ` Retry after ${command.failure.retryAfter} seconds.` : ""}{command.failure.correlationId ? ` Reference: ${command.failure.correlationId}` : ""}</p> : null}
      {Object.entries(readFailure).filter(([, problem]) => Boolean(problem)).map(([slot, problem]) => {
        const seconds = Math.max(0, Math.ceil(((readRetryAt[slot] || 0) - Date.now()) / 1_000));
        return <p role="alert" key={slot}>{problem?.message}
          {seconds ? ` Retry in ${seconds} seconds.` : ""}
          {problem?.correlationId ? ` Reference: ${problem.correlationId}` : ""}</p>;
      })}
      <section aria-labelledby="catalogue-lifecycle-heading" className="mb-6 rounded-xl border border-[var(--border,#27272a)] p-4">
        <h2 id="catalogue-lifecycle-heading" className="font-semibold">Catalogue lifecycle</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary,#71717a)]">Replace a retired blueprint without breaking active event forms. Historical documents are preserved and checked separately.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm">Blueprint to retire
            <select className="mt-1 block w-full rounded-md border p-2" value={retiringId}
              onChange={event => { setRetiringId(event.target.value); setReplacementId(""); }}>
              <option value="">Choose blueprint</option>
              {templates.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Replacement blueprint
            <select className="mt-1 block w-full rounded-md border p-2" value={replacementId}
              onChange={event => setReplacementId(event.target.value)} disabled={!retiringId}>
              <option value="">Choose replacement</option>
              {templates.filter(item => item.is_active && item.id !== retiringId &&
                item.category_key === templates.find(source => source.id === retiringId)?.category_key)
                .map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-3 block text-sm">Reason
          <textarea className="mt-1 block w-full rounded-md border p-2" maxLength={500}
            value={retirementReason} onChange={event => setRetirementReason(event.target.value)}
            placeholder="Explain why this blueprint is being retired." />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void handleRetire()} disabled={command.pending || loading}>Retire and reassign</button>
          <button type="button" onClick={() => void handleReconcile()} disabled={command.pending || loading}>Check historical documents</button>
        </div>
        <div className="mt-5 border-t pt-4">
          <h3 className="font-medium">Global category replacement</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm">Category to retire
              <select className="mt-1 block w-full rounded-md border p-2" value={retiringCategoryId}
                onChange={event => { setRetiringCategoryId(event.target.value); setReplacementCategoryId(""); }}>
                <option value="">Choose category</option>
                {categories.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Replacement category
              <select className="mt-1 block w-full rounded-md border p-2" value={replacementCategoryId}
                onChange={event => setReplacementCategoryId(event.target.value)} disabled={!retiringCategoryId}>
                <option value="">Choose replacement</option>
                {categories.filter(item => item.is_active && item.id !== retiringCategoryId)
                  .map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-3 block text-sm">Reason
            <textarea className="mt-1 block w-full rounded-md border p-2" maxLength={500}
              value={categoryRetirementReason} onChange={event => setCategoryRetirementReason(event.target.value)}
              placeholder="Explain why this category is being retired." />
          </label>
          <button type="button" className="mt-3" disabled={command.pending || loading}
            onClick={() => void handleCategoryRetire()}>Retire category and reassign</button>
        </div>
        {reconciliationStatus ? <p role="status" className="mt-3 text-sm">{reconciliationStatus}</p> : null}
        {blockedIssues.length ? <div className="mt-4 space-y-2" aria-label="Blocked historical documents">
          {blockedIssues.map(issue => <div key={issue.reconciliation_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <span><strong>{issue.template_name}</strong><br />{issue.reason}</span>
            <button type="button" disabled={command.pending}
              onClick={() => void replaceBlockedWithEmptyDocument(issue)}>Replace with safe empty blueprint</button>
            <button type="button" disabled={command.pending}
              onClick={() => setBlueprintRepair({ issue, categoryId: "",
                documentText: JSON.stringify({ fields: [], settings: {} }, null, 2), reason: "", detachInvalidLineage: false })}>
              Review blueprint correction</button>
          </div>)}
          {nextBlockedTemplateCursor ? <button type="button" disabled={command.pending || readCoolingDown || readBlocked.has("blockedTemplates")}
            onClick={() => void loadMoreBlockedTemplates()}>Load more blocked blueprints</button> : null}
        </div> : null}
        {blueprintRepair ? <form aria-label="Reviewed blueprint correction" className="mt-4 rounded-md border p-4"
          onSubmit={event => { event.preventDefault(); void submitBlueprintRepair(); }}>
          <h3 className="font-medium">Correct {blueprintRepair.issue.template_name}</h3>
          <p className="mt-1 text-sm">The reviewed JSON replaces this blueprint's saved document. The initial empty document removes its existing fields. Historical versions remain recorded.</p>
          <fieldset disabled={command.pending} className="mt-3 space-y-3">
            <div className="block text-sm">
              <label htmlFor="blueprint-correction-category">Reviewed replacement category</label>
              <select id="blueprint-correction-category" className="mt-1 block w-full rounded-md border p-2" value={blueprintRepair.categoryId}
                onChange={event => {
                  const categoryId = event.target.value;
                  const categoryLabel = event.target.selectedOptions[0]?.textContent || categoryId;
                  setBlueprintRepair(current => current ? { ...current, categoryId, categoryLabel } : null);
                }}>
                {blueprintRepair.categoryId && !categories.some(item => item.id === blueprintRepair.categoryId && item.is_active)
                  ? <option value={blueprintRepair.categoryId}>{blueprintRepair.categoryLabel || blueprintRepair.categoryId} — previously selected; rechecked on save</option>
                  : null}
                <option value="">Keep current category (must already be valid)</option>
                {categories.filter(category => category.is_active).map(category =>
                  <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            {nextCategoryCursor ? <button type="button" disabled={loading || readCoolingDown || readBlocked.has("categories")} onClick={() => void loadMoreCategories()}>Load more replacement categories</button> : null}
            <div className="block text-sm">
              <label htmlFor="blueprint-correction-document">Reviewed document JSON</label>
              <textarea id="blueprint-correction-document" className="mt-1 block w-full rounded-md border p-2 font-mono" rows={8} required maxLength={500000}
                value={blueprintRepair.documentText}
                onChange={event => setBlueprintRepair(current => current ? { ...current, documentText: event.target.value } : null)} />
            </div>
            <div className="block text-sm">
              <input id="blueprint-correction-detach" type="checkbox" checked={blueprintRepair.detachInvalidLineage}
                aria-describedby="blueprint-correction-detach-help"
                onChange={event => setBlueprintRepair(current => current ? { ...current, detachInvalidLineage: event.target.checked } : null)} />
              {" "}<label htmlFor="blueprint-correction-detach">Detach invalid historical source link</label>
              <p id="blueprint-correction-detach-help" className="mt-1 block text-xs">Only for an event blueprint with an invalid source link. Valid historical links are preserved. The removed reference is recorded safely in the audit history; no replacement source is selected.</p>
            </div>
            <div className="block text-sm">
              <label htmlFor="blueprint-correction-reason">Review reason</label>
              <textarea id="blueprint-correction-reason" className="mt-1 block w-full rounded-md border p-2" required minLength={8} maxLength={500}
                value={blueprintRepair.reason}
                onChange={event => setBlueprintRepair(current => current ? { ...current, reason: event.target.value } : null)} />
            </div>
            <div className="flex gap-3">
              <button type="submit">Commit reviewed blueprint correction</button>
              <button type="button" onClick={() => setBlueprintRepair(null)}>Cancel blueprint correction</button>
            </div>
          </fieldset>
        </form> : null}
        {blockedAggregateIssues.length || categoryRepair || rubricRepair ? <div className="mt-4 space-y-2" aria-label="Blocked event form documents">
          {blockedAggregateIssues.map(issue => <div key={issue.reconciliation_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <span><strong>{issue.resource_type === "ABSTRACT_FORM" ? "Abstract form"
              : issue.resource_type === "REGISTRATION_FORM" ? "Registration form"
              : issue.resource_type === "PROGRAMME_RUBRIC" ? "Evaluation rubric" : "Organisation category"}</strong><br />
              {issue.resource_type === "FORM_CATEGORY" ? `Organisation ${issue.organization_id}` : `Event ${issue.event_id}`} · {issue.reason}</span>
            {issue.resource_type === "FORM_CATEGORY" ? <button type="button" disabled={command.pending}
              onClick={() => setCategoryRepair({ issue,
                name: issue.current_document?.name || "", slug: issue.current_document?.slug || "",
                description: issue.current_document?.description || "", icon: issue.current_document?.icon || "",
                sortOrder: String(issue.current_document?.sort_order ?? 0), reason: "" })}>Review category correction</button>
              : issue.resource_type === "PROGRAMME_RUBRIC" ? <button type="button" disabled={command.pending}
                onClick={() => { setRubricRepair({ issue, documentText: "", reason: "" }); setRubricRepairError(null); }}>
                Review rubric correction</button>
              : <button type="button" disabled={command.pending}
                onClick={() => void replaceBlockedAggregate(issue)}>Replace with safe empty document</button>}
            {issue.resource_type === "REGISTRATION_FORM" ? <button type="button" disabled={command.pending}
              onClick={() => void replaceBlockedAggregate(issue, true)}>Detach invalid links and reset form</button> : null}
          </div>)}
          {nextBlockedRegistrationCursor ? <button type="button" disabled={command.pending || readCoolingDown || readBlocked.has("blockedREGISTRATION_FORM")}
            onClick={() => void loadMoreBlockedAggregates("REGISTRATION_FORM")}>Load more blocked registration forms</button> : null}
          {nextBlockedAbstractCursor ? <button type="button" disabled={command.pending || readCoolingDown || readBlocked.has("blockedABSTRACT_FORM")}
            onClick={() => void loadMoreBlockedAggregates("ABSTRACT_FORM")}>Load more blocked abstract forms</button> : null}
          {nextBlockedRubricCursor ? <button type="button" disabled={command.pending || readCoolingDown || readBlocked.has("blockedPROGRAMME_RUBRIC")}
            onClick={() => void loadMoreBlockedAggregates("PROGRAMME_RUBRIC")}>Load more blocked evaluation rubrics</button> : null}
          {nextBlockedTenantCategoryCursor ? <button type="button" disabled={command.pending || readCoolingDown || readBlocked.has("blockedFORM_CATEGORY")}
            onClick={() => void loadMoreBlockedAggregates("FORM_CATEGORY")}>Load more blocked organisation categories</button> : null}
          {rubricRepair ? <form className="rounded-md border p-4 space-y-3"
            aria-label="Reviewed rubric correction" onSubmit={event => { event.preventDefault(); void submitRubricRepair(); }}>
            <fieldset disabled={command.pending} className="space-y-3">
              <legend className="font-medium">Review evaluation rubric correction</legend>
              <p className="text-sm">Plan {rubricRepair.issue.resource_id} · version {rubricRepair.issue.resource_version}.</p>
              <p className="text-sm">Enter an explicitly reviewed scoring definition. Raw historical documents are not exposed here.
                Submitted scores prevent correction; reviewers, assignments and scores will not be changed.</p>
              <div><label htmlFor="rubric-correction-document">Corrected rubric JSON</label>
                <textarea id="rubric-correction-document" required maxLength={65536} rows={10}
                  aria-describedby="rubric-correction-help"
                  className="mt-1 block w-full rounded-md border p-2 font-mono text-sm"
                  value={rubricRepair.documentText} onChange={event => setRubricRepair(current => current
                    ? { ...current, documentText: event.target.value } : null)} />
                <p id="rubric-correction-help" className="text-sm">Only the rubric field is accepted. Use up to 20 criteria with explicit unique scoring keys and weights totalling 100.</p>
              </div>
              <div><label htmlFor="rubric-correction-reason">Review reason</label>
                <textarea id="rubric-correction-reason" required minLength={8} maxLength={500}
                  className="mt-1 block w-full rounded-md border p-2"
                  value={rubricRepair.reason} onChange={event => setRubricRepair(current => current
                    ? { ...current, reason: event.target.value } : null)} />
              </div>
              {rubricRepairError ? <p role="alert">{rubricRepairError}</p> : null}
              <div className="flex gap-3"><button type="submit">Commit reviewed rubric correction</button>
                <button type="button" onClick={() => { setRubricRepair(null); setRubricRepairError(null); }}>Cancel rubric correction</button></div>
            </fieldset>
          </form> : null}
          {categoryRepair ? <div className="rounded-md border p-4 space-y-3" aria-label="Reviewed category correction">
            <h3 className="font-medium">Review category correction</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">Name<input className="mt-1 block w-full rounded-md border p-2" maxLength={100}
                value={categoryRepair.name} onChange={event => setCategoryRepair(current => current ? { ...current, name: event.target.value } : current)} /></label>
              <label className="text-sm">Slug<input className="mt-1 block w-full rounded-md border p-2" maxLength={100}
                pattern="[a-z0-9_-]+" value={categoryRepair.slug}
                onChange={event => setCategoryRepair(current => current ? { ...current, slug: event.target.value } : current)} /></label>
              <label className="text-sm">Icon<input className="mt-1 block w-full rounded-md border p-2" maxLength={50}
                value={categoryRepair.icon} onChange={event => setCategoryRepair(current => current ? { ...current, icon: event.target.value } : current)} /></label>
              <label className="text-sm">Order<input className="mt-1 block w-full rounded-md border p-2" type="number" min={0} max={100000}
                value={categoryRepair.sortOrder} onChange={event => setCategoryRepair(current => current ? { ...current, sortOrder: event.target.value } : current)} /></label>
            </div>
            <label className="text-sm">Description<textarea className="mt-1 block w-full rounded-md border p-2" maxLength={255}
              value={categoryRepair.description} onChange={event => setCategoryRepair(current => current ? { ...current, description: event.target.value } : current)} /></label>
            <label className="text-sm">Review reason<textarea className="mt-1 block w-full rounded-md border p-2" minLength={8} maxLength={500}
              value={categoryRepair.reason} onChange={event => setCategoryRepair(current => current ? { ...current, reason: event.target.value } : current)} /></label>
            <div className="flex gap-2">
              <button type="button" disabled={command.pending} onClick={() => void submitCategoryRepair()}>Approve correction</button>
              <button type="button" disabled={command.pending} onClick={() => setCategoryRepair(null)}>Cancel</button>
            </div>
          </div> : null}
        </div> : null}
        {blockedCategoryIssues.length ? <div className="mt-4 space-y-2" aria-label="Blocked category reconciliation">
          {blockedCategoryIssues.map(issue => <div key={issue.reconciliation_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <span><strong>{issue.category_name}</strong> ({issue.category_slug})<br />{issue.reason}</span>
            <button type="button" disabled={command.pending || !issue.current_document}
              onClick={() => setCategoryRepair({
                issue: { resource_id: issue.category_id, resource_version: issue.category_version },
                name: issue.current_document?.name || "", slug: issue.current_document?.slug || "",
                description: issue.current_document?.description || "", icon: issue.current_document?.icon || "",
                sortOrder: String(issue.current_document?.sort_order ?? 0), reason: "",
              })}>Review category correction</button>
            <button type="button" disabled={command.pending}
              onClick={() => {
                setRetiringCategoryId(issue.category_id);
                setReplacementCategoryId("");
                setCategoryRetirementReason("Resolve blocked historical taxonomy by replacing this conflicting global category.");
                document.getElementById("catalogue-lifecycle-heading")?.scrollIntoView({ behavior: "smooth" });
              }}>Resolve through category replacement</button>
          </div>)}
          {nextBlockedCategoryCursor ? <button type="button" disabled={command.pending || readCoolingDown || readBlocked.has("blockedCategory")}
            onClick={() => void loadMoreBlockedCategories()}>Load more blocked categories</button> : null}
        </div> : null}
      </section>
      <fieldset className="min-w-0" disabled={loading || command.pending || Boolean(loadError)}>
      <FormTemplateGallery
        templates={templates}
        categories={categories}
        mode="command-center"
        onSelectTemplate={handleSelectTemplate}
        onCreateCustomTemplate={handleCreateCustomTemplate}
        onCreateCategory={handleCreateCategory}
        onDeleteCategory={handleDeleteCategory}
      />
      </fieldset>
      {nextTemplateCursor ? <button type="button" className="mt-4" disabled={loading || readCoolingDown || readBlocked.has("templates")}
        onClick={() => void loadMoreTemplates()}>{readPending.has("templates") ? "Loading..." : "Load more blueprints"}</button> : null}
      {nextCategoryCursor ? <button type="button" className="ml-2 mt-4" disabled={loading || readCoolingDown || readBlocked.has("categories")}
        onClick={() => void loadMoreCategories()}>{readPending.has("categories") ? "Loading..." : "Load more categories"}</button> : null}
      {loadError ? <button type="button" disabled={readCoolingDown} onClick={() => void loadData()}>Reload catalogue</button> : null}
    </div></PageContainer>
  );
}
