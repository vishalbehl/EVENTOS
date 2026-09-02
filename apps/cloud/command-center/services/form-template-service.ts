import { apiClient } from "@/lib/api-client";
import { FormTemplate, FormCategory, FormField, FormSettings } from "@eventos/form-builder-studio";

export const platformFormService = {
  // ── Categories ─────────────────────────────────────────
  listCategories: async () => {
    return apiClient.get<FormCategory[]>("/forms/categories");
  },

  createCategory: async (payload: { name: string; description?: string; icon?: string }) => {
    return apiClient.post<FormCategory>("/forms/categories", payload);
  },

  updateCategory: async (id: string, payload: Partial<FormCategory>) => {
    return apiClient.patch<FormCategory>(`/forms/categories/${id}`, payload);
  },

  deleteCategory: async (id: string) => {
    return apiClient.delete(`/forms/categories/${id}`);
  },

  // ── Templates ──────────────────────────────────────────
  listTemplates: async (params?: { category_key?: string; scope_type?: string; search?: string }) => {
    return apiClient.get<FormTemplate[]>("/forms/templates", { params });
  },

  getTemplate: async (id: string) => {
    return apiClient.get<FormTemplate>(`/forms/templates/${id}`);
  },

  createTemplate: async (payload: {
    name: string;
    category_key: string;
    description?: string;
    fields?: FormField[];
    settings?: FormSettings;
    scope_type?: string;
    is_default?: boolean;
  }) => {
    return apiClient.post<FormTemplate>("/forms/templates", payload);
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
    }
  ) => {
    return apiClient.put<FormTemplate>(`/forms/templates/${id}`, payload);
  },

  duplicateTemplate: async (id: string) => {
    return apiClient.post<FormTemplate>(`/forms/templates/${id}/duplicate`);
  },

  deleteTemplate: async (id: string) => {
    return apiClient.delete(`/forms/templates/${id}`);
  },
};
