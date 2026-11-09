import { apiClient } from "@/lib/api-client";
import { FormTemplate, FormCategory, FormField, FormSettings, catalogueDocumentForSave } from "@eventos/form-builder-studio";

export interface FormTemplatePage {
  items: FormTemplate[];
  next_cursor?: string | null;
  has_next: boolean;
  has_more?: boolean;
}

export interface FormCategoryPage {
  items: FormCategory[];
  next_cursor?: string | null;
  has_next: boolean;
}

export interface CatalogueReconciliationIssue {
  reconciliation_id: string;
  template_id: string;
  template_name: string;
  template_version: number;
  reason: string;
  created_at: string;
}

export interface AggregateReconciliationIssue {
  reconciliation_id: string;
  organization_id: string;
  event_id?: string | null;
  resource_type: "FORM_CATEGORY" | "REGISTRATION_FORM" | "ABSTRACT_FORM" | "PROGRAMME_RUBRIC";
  resource_id: string;
  resource_version: number;
  reason: string;
  created_at: string;
  current_document?: {
    name: string;
    slug: string;
    description?: string | null;
    icon?: string | null;
    sort_order: number;
  } | null;
}

export interface CategoryReconciliationIssue {
  reconciliation_id: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  category_version: number;
  reason: string;
  details: Record<string, unknown>;
  created_at: string;
  current_document?: AggregateReconciliationIssue["current_document"];
}

export interface CatalogueReconciliationRunStatus {
  run_id: string;
  status: "PENDING" | "RUNNING" | "DISPATCHED" | "FAILED";
  completion_status: "PENDING" | "COMPLETED" | "FAILED" | "LEGACY_UNTRACKED";
  streams_total: number;
  streams_completed: number;
  pages_completed: number;
  checked_count: number;
  blocked_count: number;
  dispatch_attempts: number;
  started_at?: string | null;
  dispatched_at?: string | null;
  failure_code?: string | null;
}

export const platformFormService = {
  // ── Categories ─────────────────────────────────────────
  listCategoryPage: async (params?: { cursor?: string; page_size?: number }, signal?: AbortSignal) => {
    return apiClient.get<FormCategoryPage>("/platform/forms/categories", { params, signal });
  },

  listBlockedCategoryReconciliations: async (params?: { cursor?: string; page_size?: number }, signal?: AbortSignal) =>
    apiClient.get<{ items: CategoryReconciliationIssue[]; next_cursor?: string | null; has_next: boolean }>(
      "/platform/forms/categories/reconciliations/blocked", { params, signal },
    ),

  createCategory: async (payload: { name: string; description?: string; icon?: string }, key: string) => {
    return apiClient.post<FormCategory>("/platform/forms/categories", payload, { headers: { "Idempotency-Key": key } });
  },

  updateCategory: async (id: string, payload: Partial<FormCategory>, contract: { version: number; key: string }) => {
    return apiClient.patch<FormCategory>(`/platform/forms/categories/${id}`, payload,
      { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },

  deleteCategory: async (id: string, contract: { version: number; key: string }) => {
    return apiClient.delete(`/platform/forms/categories/${id}`,
      { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },

  // ── Templates ──────────────────────────────────────────
  listTemplatePage: async (params?: { category_key?: string; search?: string; cursor?: string; page_size?: number }, signal?: AbortSignal) => {
    return apiClient.get<FormTemplatePage>("/platform/forms/templates", { params, signal });
  },

  getTemplate: async (id: string) => {
    return apiClient.get<FormTemplate>(`/platform/forms/templates/${id}`);
  },

  createTemplate: async (payload: {
    name: string;
    category_key: string;
    description?: string;
    fields?: FormField[];
    settings?: FormSettings;
    scope_type?: string;
    is_default?: boolean;
  }, key: string) => {
    const document = catalogueDocumentForSave(payload.fields || [], payload.settings || {});
    return apiClient.post<FormTemplate>("/platform/forms/templates", { ...payload, ...document }, { headers: { "Idempotency-Key": key } });
  },

  updateTemplate: async (
    id: string,
    payload: {
      name?: string;
      description?: string;
      category_key?: string;
      is_default?: boolean;
      is_active?: boolean;
      fields?: FormField[];
      settings?: FormSettings;
    },
    contract: { version: number; key: string }
  ) => {
    const document = catalogueDocumentForSave(payload.fields || [], payload.settings || {});
    return apiClient.put<FormTemplate>(`/platform/forms/templates/${id}`, {
      ...payload,
      ...(payload.fields !== undefined ? { fields: document.fields } : {}),
      ...(payload.settings !== undefined ? { settings: document.settings } : {}),
    }, { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },

  duplicateTemplate: async (id: string, contract: { version: number; key: string }) => {
    return apiClient.post<FormTemplate>(`/platform/forms/templates/${id}/duplicate`, {}, { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },

  deleteTemplate: async (id: string, contract: { version: number; key: string }) => {
    return apiClient.delete(`/platform/forms/templates/${id}`, { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },

  retireTemplate: async (
    id: string,
    payload: { replacement_template_id: string; reason: string },
    contract: { version: number; key: string },
  ) => apiClient.post<{
    template_id: string;
    replacement_template_id: string;
    version: number;
    status: "RETIRED";
    reassigned: { registration: number; active_abstract_forms: number };
  }>(`/platform/forms/templates/${id}/retire`, payload, {
    headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key },
  }),

  reconcileHistoricalDocuments: async (key: string, payload: { cursor?: string; page_size?: number } = {}) =>
    apiClient.post<{ checked: number; normalized: number; blocked: number; next_cursor?: string | null }>(
      "/platform/forms/templates/reconcile", { page_size: 50, ...payload },
      { headers: { "Idempotency-Key": key } },
    ),

  listBlockedReconciliations: async (params?: { cursor?: string; page_size?: number }, signal?: AbortSignal) =>
    apiClient.get<{ items: CatalogueReconciliationIssue[]; next_cursor?: string | null; has_next: boolean }>(
      "/platform/forms/templates/reconciliations/blocked", { params, signal },
    ),

  listBlockedAggregateReconciliations: async (
    resourceType: AggregateReconciliationIssue["resource_type"],
    params?: { cursor?: string; page_size?: number },
    signal?: AbortSignal,
  ) => apiClient.get<{ items: AggregateReconciliationIssue[]; next_cursor?: string | null; has_next: boolean }>(
    "/platform/forms/templates/reconciliations/aggregates/blocked",
    { params: { resource_type: resourceType, ...params }, signal },
  ),

  getReconciliationRun: async (runId: string) =>
    apiClient.get<CatalogueReconciliationRunStatus>(
      `/platform/forms/templates/reconciliation-runs/${encodeURIComponent(runId)}`,
    ),
};
