import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { FormTemplate, FormCategory, FormField, FormSettings, catalogueDocumentForSave, eventFormDocumentForSave } from "@eventos/form-builder-studio";

export interface EventFormConfig {
  id: string;
  event_id: string;
  template_id?: string;
  category_id?: string;
  is_live: boolean;
  version: number;
  fields: FormField[];
  settings?: FormSettings;
  terms_and_conditions?: string;
}

export interface OperationalFormBinding {
  id?: string | null;
  event_id: string;
  purpose: "SPEAKER_INTAKE" | "SURVEY";
  template_id?: string | null;
  version: number;
  template?: FormTemplate | null;
}

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
  has_more?: boolean;
}

export const organiserFormService = {
  // ── Categories ─────────────────────────────────────────
  listCategoryPage: async (params?: { event_id?: string; cursor?: string; page_size?: string }, signal?: AbortSignal) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return apiGet<FormCategoryPage>(`/forms/categories${query ? `?${query}` : ""}`, { signal });
  },

  createCategory: async (payload: { name: string; description?: string; icon?: string }, key: string) => {
    return apiPost<FormCategory>("/forms/categories", payload, { headers: { "Idempotency-Key": key } });
  },

  updateCategory: async (id: string, payload: Partial<FormCategory>, contract: { version: number; key: string }) => {
    return apiPatch<FormCategory>(`/forms/categories/${id}`, payload,
      { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },

  deleteCategory: async (id: string, contract: { version: number; key: string }) => {
    return apiDelete(`/forms/categories/${id}`,
      { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },

  // ── Templates ──────────────────────────────────────────
  listTemplatePage: async (params?: { category_key?: string; search?: string; event_id?: string; source_template_id?: string; cursor?: string; page_size?: string }, signal?: AbortSignal) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return apiGet<FormTemplatePage>(`/forms/templates${query ? `?${query}` : ""}`, { signal });
  },

  getTemplate: async (id: string, eventId?: string, signal?: AbortSignal) => {
    const context = eventId ? `?event_id=${encodeURIComponent(eventId)}` : "";
    return apiGet<FormTemplate>(`/forms/templates/${encodeURIComponent(id)}${context}`, { signal });
  },

  getOperationalBinding: async (eventId: string, purpose: "SPEAKER_INTAKE" | "SURVEY", signal?: AbortSignal) =>
    apiGet<OperationalFormBinding>(`/forms/templates/events/${eventId}/operational-bindings/${purpose}`, { signal }),

  createCustomTemplate: async (payload: {
    name: string;
    category_key: string;
    description?: string;
    fields?: FormField[];
    settings?: FormSettings;
  }, key: string) => {
    return apiPost<FormTemplate>("/forms/templates", {
      ...payload,
      ...catalogueDocumentForSave(payload.fields || [], payload.settings || {}),
      scope_type: "ORGANIZATION",
    }, { headers: { "Idempotency-Key": key } });
  },

  duplicateTemplate: async (id: string, contract: { version: number; key: string }) => {
    return apiPost<FormTemplate>(`/forms/templates/${id}/duplicate`, {},
      { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },

  /**
   * Save a customised version of a template for a specific event.
   * Creates a new EVENT-scoped FormTemplate on first call, then updates it on subsequent saves.
   * @param sourceTemplateId - ID of the original global/org template being customised
   * @param eventId - The event this customisation belongs to
   * @param data - Updated fields, settings, and optional new name
   */
  saveAsEventCopy: async (
    sourceTemplateId: string,
    eventId: string,
    data: {
      fields: FormField[];
      settings?: FormSettings;
      name?: string;
    },
    contract: { version: number; key: string },
  ) => {
    return apiPost<FormTemplate>(`/forms/templates/${sourceTemplateId}/save-as-event-copy`, {
      event_id: eventId,
      ...eventFormDocumentForSave(data.fields, data.settings || {}),
      name: data.name,
    }, { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },

  /**
   * Soft-delete an EVENT-scoped template copy (resets to global template).
   * @param eventCopyTemplateId - ID of the event-scoped copy to delete
   */
  deleteEventCopy: async (eventCopyTemplateId: string, contract: { version: number; key: string }) => {
    // Event aggregate copies cannot be retired through the catalogue endpoint.
    return apiDelete(`/forms/templates/${eventCopyTemplateId}`,
      { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },

  // ── Event Form Binding ─────────────────────────────────
  getEventFormConfig: async (eventId: string, signal?: AbortSignal) => {
    return apiGet<EventFormConfig>(`/events/${eventId}/registration/form-config?t=${Date.now()}`, { signal });
  },

  saveEventFormConfig: async (
    eventId: string,
    payload: {
      fields: FormField[];
      is_live?: boolean;
      settings?: FormSettings;
      terms_and_conditions?: string;
      template_id?: string;
    },
    contract: { version: number; key: string }
  ) => {
    if (!Number.isInteger(contract.version) || contract.version < 1) {
      throw new Error("Reload the current form before saving.");
    }
    const document = eventFormDocumentForSave(payload.fields, payload.settings || {});
    return apiPost<EventFormConfig>(
      `/events/${eventId}/registration/form-config`,
      { ...payload, fields: document.fields,
        ...(payload.settings !== undefined ? { settings: document.settings } : {}) },
      { headers: { "If-Match": String(contract.version), "Idempotency-Key": contract.key } });
  },
};
