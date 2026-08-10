import { apiClient } from "@/lib/api-client";

export type EmailStudioRecord = {
  id: string;
  name: string;
  stable_key: string;
  template_type: string;
  target_type: string;
  scope_type: "PLATFORM" | "ORGANIZATION" | "EVENT";
  organization_id?: string | null;
  subject: string;
  preheader?: string | null;
  body_html: string;
  body_text?: string | null;
  designer_json?: Record<string, unknown> | null;
  version: number;
  lifecycle_state: "DRAFT" | "PUBLISHED" | "ARCHIVED" | "LEGACY";
  effective_origin: "PLATFORM" | "ORGANIZATION" | "EVENT";
  editable: boolean;
  fallback_reason?: string | null;
};

export type EmailStudioVersion = {
  id: string;
  version_number: number;
  lifecycle_state: "DRAFT" | "PUBLISHED" | "LEGACY";
  published_at?: string | null;
};
export type EmailStudioPreview = { subject: string; html: string; plain_text: string; diagnostics: Array<{ path: string; message: string; severity: "error" | "warning" }> };
export type EmailFragmentRecord = { id: string; name: string; stable_key: string; component_kind: "BLOCK" | "SECTION"; category: string; scope_type: "PLATFORM" | "ORGANIZATION" | "EVENT"; document_fragment: Record<string, unknown>; editable: boolean };
export type EmailAssetRecord = { id: string; name: string; url: string; file_type: string; scope_type: "PLATFORM" | "ORGANIZATION" | "EVENT"; asset_kind?: "IMAGE" | "ICON"; source_type?: "UPLOAD" | "URL_IMPORT" | "BUILTIN_ICON" | "DERIVED"; width?: number | null; height?: number | null; metadata?: Record<string, unknown> };

const headers = (version?: number) => ({
  "Idempotency-Key": crypto.randomUUID(),
  ...(version ? { "If-Match": String(version) } : {}),
});

export const platformEmailTemplates = {
  list: (targetType = "speaker") => apiClient.get<EmailStudioRecord[]>("/platform/communications/email-templates", { params: { target_type: targetType } }),
  create: (payload: { name: string; stable_key: string; template_type: string; target_type: string }) => apiClient.post<EmailStudioRecord>("/platform/communications/email-templates", payload, { headers: headers() }),
  saveDraft: (id: string, version: number, payload: object) => apiClient.put<EmailStudioRecord>(`/platform/communications/email-templates/${id}/draft`, payload, { headers: headers(version) }),
  publish: (id: string, version: number, reason: string) => apiClient.post<EmailStudioRecord>(`/platform/communications/email-templates/${id}/publish`, { reason }, { headers: headers(version) }),
  versions: (id: string) => apiClient.get<EmailStudioVersion[]>(`/platform/communications/email-templates/${id}/versions`),
  rollback: (id: string, version: number, versionId: string, reason: string) => apiClient.post<EmailStudioRecord>(`/platform/communications/email-templates/${id}/rollback`, { version_id: versionId, reason }, { headers: headers(version) }),
  preview: (id: string, payload: object) => apiClient.post<EmailStudioPreview>(`/platform/communications/email-templates/${id}/preview`, { ...payload, preview_data_profile: "representative" }),
  testSend: (id: string, recipientEmail: string, payload: object) => apiClient.post(`/platform/communications/email-templates/${id}/test-send`, { ...payload, recipient_email: recipientEmail, preview_data_profile: "representative" }, { headers: headers() }),
  delete: (id: string) => apiClient.delete(`/platform/communications/email-templates/${id}`),
  duplicate: (id: string) => apiClient.post<EmailStudioRecord>(`/platform/communications/email-templates/${id}/duplicate`),
  updateScope: (id: string, scopeType: "PLATFORM" | "ORGANIZATION", organizationId?: string | null) => apiClient.put<EmailStudioRecord>(`/platform/communications/email-templates/${id}/scope`, { scope_type: scopeType, organization_id: organizationId }),
  listOrganizations: () => apiClient.get<Array<{ id: string; name: string; slug?: string }>>("/platform/communications/email-templates/organizations-list"),
};

export const platformEmailComponents = {
  list: () => apiClient.get<EmailFragmentRecord[]>("/platform/communications/email-components"),
  create: (payload: object) => apiClient.post<EmailFragmentRecord>("/platform/communications/email-components", payload, { headers: headers() }),
};
export const platformEmailAssets = {
  list: () => apiClient.get<EmailAssetRecord[]>("/platform/communications/email-assets"),
  upload: (file: File, assetKind: "IMAGE" | "ICON" = "IMAGE") => { const data = new FormData(); data.append("file", file); return apiClient.post<EmailAssetRecord>("/platform/communications/email-assets", data, { params: { asset_kind: assetKind }, headers: { "Content-Type": "multipart/form-data", "Idempotency-Key": crypto.randomUUID() } }); },
};
