import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { FormTemplate, FormCategory, FormField, FormSettings } from "@eventos/form-builder-studio";

export const organiserFormService = {
  // ── Categories ─────────────────────────────────────────
  listCategories: async () => {
    return apiGet<FormCategory[]>("/forms/categories");
  },

  createCategory: async (payload: { name: string; description?: string; icon?: string }) => {
    return apiPost<FormCategory>("/forms/categories", payload);
  },

  updateCategory: async (id: string, payload: Partial<FormCategory>) => {
    return apiPatch<FormCategory>(`/forms/categories/${id}`, payload);
  },

  deleteCategory: async (id: string) => {
    return apiDelete(`/forms/categories/${id}`);
  },

  // ── Templates ──────────────────────────────────────────
  listTemplates: async (params?: { category_key?: string; search?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return apiGet<FormTemplate[]>(`/forms/templates${query ? `?${query}` : ""}`);
  },

  getTemplate: async (id: string) => {
    return apiGet<FormTemplate>(`/forms/templates/${id}`);
  },

  createCustomTemplate: async (payload: {
    name: string;
    category_key: string;
    description?: string;
    fields?: FormField[];
    settings?: FormSettings;
  }) => {
    return apiPost<FormTemplate>("/forms/templates", {
      ...payload,
      scope_type: "ORGANIZATION",
    });
  },

  duplicateTemplate: async (id: string) => {
    return apiPost<FormTemplate>(`/forms/templates/${id}/duplicate`, {});
  },

  // ── Event Form Binding ─────────────────────────────────
  getEventFormConfig: async (eventId: string) => {
    return apiGet<{
      id: string;
      event_id: string;
      template_id?: string;
      category_id?: string;
      is_live: boolean;
      fields: FormField[];
      settings?: FormSettings;
      terms_and_conditions?: string;
    }>(`/events/${eventId}/registration/form-config?t=${Date.now()}`);
  },

  saveEventFormConfig: async (
    eventId: string,
    payload: {
      fields: FormField[];
      is_live: boolean;
      settings?: FormSettings;
      terms_and_conditions?: string;
      template_id?: string;
    }
  ) => {
    return apiPost(`/events/${eventId}/registration/form-config`, payload);
  },
};
