import { apiClient } from "@/lib/api-client";

export type EmailStudioRecord = {
  id: string; name: string; stable_key: string; template_type: string; target_type: string;
  scope_type: "PLATFORM" | "ORGANIZATION" | "EVENT"; organization_id?: string | null; subject: string; preheader?: string | null; body_html: string;
  body_text?: string | null; designer_json?: Record<string, unknown> | null; version: number;
  lifecycle_state: "DRAFT" | "PUBLISHED" | "ARCHIVED" | "LEGACY";
  effective_origin: "PLATFORM" | "ORGANIZATION" | "EVENT"; editable: boolean; fallback_reason?: string | null;
};
export type EmailFragmentRecord = { id: string; name: string; stable_key: string; component_kind: "BLOCK" | "SECTION"; category: string; scope_type: "PLATFORM" | "ORGANIZATION" | "EVENT"; document_fragment: Record<string, unknown>; editable: boolean };
export type EmailAssetRecord = { id: string; name: string; url: string; file_type: string; scope_type: "PLATFORM" | "ORGANIZATION" | "EVENT"; asset_kind?: "IMAGE" | "ICON"; source_type?: "UPLOAD" | "URL_IMPORT" | "BUILTIN_ICON" | "DERIVED"; width?: number | null; height?: number | null; metadata?: Record<string, unknown> };

export type EventPreviewContextResponse = {
  variables: Array<{ key: string; label: string; required?: boolean; sampleValue?: string }>;
  sample_values: Record<string, string>;
  sample_collections: Record<string, Array<Record<string, string>>>;
};

const headers = (version: number) => ({ "Idempotency-Key": crypto.randomUUID(), "If-Match": String(version) });
export const eventEmailTemplates = {
  list: (eventId: string, targetType = "speaker") => apiClient.get<EmailStudioRecord[]>(`/events/${eventId}/notifications/template-studio`, { params: { target_type: targetType } }),
  getPreviewContext: (eventId: string) => apiClient.get<EventPreviewContextResponse>(`/events/${eventId}/notifications/template-studio/preview-context`),
  create: (eventId: string, payload: object) => apiClient.post<EmailStudioRecord>(`/events/${eventId}/notifications/template-studio`, payload, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
  saveDraft: (eventId: string, id: string, version: number, payload: object) => apiClient.put<EmailStudioRecord>(`/events/${eventId}/notifications/template-studio/${id}/draft`, payload, { headers: headers(version) }),
  publish: (eventId: string, id: string, version: number, reason: string) => apiClient.post<EmailStudioRecord>(`/events/${eventId}/notifications/template-studio/${id}/publish`, { reason }, { headers: headers(version) }),
  preview: (eventId: string, id: string, payload: object) => apiClient.post<{ subject: string; html: string; plain_text: string; diagnostics: Array<{ path: string; message: string; severity: "error" | "warning" }> }>(`/events/${eventId}/notifications/template-studio/${id}/preview`, { ...payload, preview_data_profile: "representative" }),
  testSend: (eventId: string, id: string, recipientEmail: string, payload: object) => apiClient.post(`/events/${eventId}/notifications/template-studio/${id}/test-send`, { ...payload, recipient_email: recipientEmail, preview_data_profile: "representative" }, { headers: headers(1) }),
  delete: (eventId: string, id: string) => apiClient.delete(`/events/${eventId}/notifications/template-studio/${id}`),
  duplicate: (eventId: string, id: string) => apiClient.post<EmailStudioRecord>(`/events/${eventId}/notifications/template-studio/${id}/duplicate`),
};
export const organizationEmailTemplates = {
  list: (organizationId: string, targetType = "speaker") => apiClient.get<EmailStudioRecord[]>(`/organizations/${organizationId}/email-templates`, { params: { target_type: targetType } }),
  create: (organizationId: string, payload: object) => apiClient.post<EmailStudioRecord>(`/organizations/${organizationId}/email-templates`, payload, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
  saveDraft: (organizationId: string, id: string, version: number, payload: object) => apiClient.put<EmailStudioRecord>(`/organizations/${organizationId}/email-templates/${id}/draft`, payload, { headers: headers(version) }),
  publish: (organizationId: string, id: string, version: number, reason: string) => apiClient.post<EmailStudioRecord>(`/organizations/${organizationId}/email-templates/${id}/publish`, { reason }, { headers: headers(version) }),
  preview: (organizationId: string, id: string, payload: object) => apiClient.post<{ subject: string; html: string; plain_text: string; diagnostics: Array<{ path: string; message: string; severity: "error" | "warning" }> }>(`/organizations/${organizationId}/email-templates/${id}/preview`, { ...payload, preview_data_profile: "representative" }),
  testSend: (organizationId: string, id: string, recipientEmail: string, payload: object) => apiClient.post(`/organizations/${organizationId}/email-templates/${id}/test-send`, { ...payload, recipient_email: recipientEmail, preview_data_profile: "representative" }, { headers: headers(1) }),
  delete: (organizationId: string, id: string) => apiClient.delete(`/organizations/${organizationId}/email-templates/${id}`),
  duplicate: (organizationId: string, id: string) => apiClient.post<EmailStudioRecord>(`/organizations/${organizationId}/email-templates/${id}/duplicate`),
};
export const organizationEmailComponents = {
  list: (organizationId: string) => apiClient.get<EmailFragmentRecord[]>(`/organizations/${organizationId}/email-components`),
  create: (organizationId: string, payload: object) => apiClient.post<EmailFragmentRecord>(`/organizations/${organizationId}/email-components`, payload, { headers: headers(1) }),
};
export const eventEmailComponents = {
  list: (eventId: string) => apiClient.get<EmailFragmentRecord[]>(`/events/${eventId}/notifications/email-components`),
  create: (eventId: string, payload: object) => apiClient.post<EmailFragmentRecord>(`/events/${eventId}/notifications/email-components`, payload, { headers: headers(1) }),
};
export const organizationEmailAssets = {
  list: (organizationId: string) => apiClient.get<EmailAssetRecord[]>(`/organizations/${organizationId}/email-assets`),
  upload: (organizationId: string, file: File, assetKind: "IMAGE" | "ICON" = "IMAGE") => { const data = new FormData(); data.append("file", file); return apiClient.post<EmailAssetRecord>(`/organizations/${organizationId}/email-assets`, data, { params: { asset_kind: assetKind }, headers: { "Content-Type": undefined, "Idempotency-Key": crypto.randomUUID() } as any }); },
};
export const eventEmailAssets = {
  list: (eventId: string) => apiClient.get<EmailAssetRecord[]>(`/events/${eventId}/emails/assets`),
};
