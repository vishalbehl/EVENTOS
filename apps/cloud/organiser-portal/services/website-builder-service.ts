import { apiClient } from "@/lib/api-client";
import type { EventDataSnapshot, WebsiteAsset, WebsiteDocument } from "@eventos/website-builder-studio";

export type WebsiteDraftRecord = {
  site_id: string;
  site_slug: string;
  draft_id: string;
  event_id: string;
  organization_id: string;
  document: WebsiteDocument;
  schema_version: number;
  checksum: string;
  version: number;
  updated_at: string;
};

export type WebsiteValidationResult = {
  valid: boolean;
  diagnostics: Array<Record<string, unknown>>;
};

export type WebsiteCheckpointResult = {
  revision_id: string;
  revision_number: number;
  checksum: string;
};

export type WebsiteDeploymentRecord = {
  deployment_id: string;
  revision_id: string;
  site_id: string;
  status: "PENDING" | "ACTIVE" | "FAILED" | string;
  storage_prefix: string;
  manifest: Record<string, unknown>;
  diagnostics: Array<Record<string, unknown>>;
  activated_at?: string | null;
  public_url?: string | null;
};

export type WebsiteRevisionSummary = {
  revision_id: string;
  revision_number: number;
  reason: "MANUAL_SAVE" | "PUBLISH" | "ROLLBACK" | string;
  checksum: string;
  diagnostics: Array<Record<string, unknown>>;
  created_at: string;
};

export type WebsiteAssetReferenceRecord = {
  id: string;
  kind: "image" | "svg" | "icon" | "download" | string;
  source: "upload" | "openverse" | "undraw" | "manual" | string;
  url?: string | null;
  storage_path?: string | null;
  creator?: string | null;
  license?: string | null;
  attribution?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type WebsiteDomainRecord = {
  id: string;
  domain: string;
  verification_token: string;
  verification_record_name: string;
  verification_record_value: string;
  dns_state: "PENDING" | "VERIFIED" | "FAILED" | string;
  tls_state: "PENDING" | "ACTIVE" | "FAILED" | string;
  active_deployment_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type WebsiteEditorSessionRecord = {
  session_id: string;
  site_id: string;
  mode: "EDITOR" | "VIEWER";
  heartbeat_at: string;
  expires_at: string;
};

export type WebsitePreviewRecord = {
  preview_id: string;
  url: string;
  checksum: string;
  expires_at: string;
};

export type OpenverseImageResult = {
  id: string;
  title: string;
  url?: string | null;
  thumbnail?: string | null;
  creator?: string | null;
  source?: string | null;
  license?: string | null;
  attribution?: string | null;
};

export type WebsiteEventSnapshot = EventDataSnapshot & {
  dataStatus: "connected" | "snapshot" | "missing" | "mock" | "manual" | "error";
  mockFallback: Record<string, boolean>;
};

const mutationHeaders = (version?: number) => ({
  "Idempotency-Key": crypto.randomUUID(),
  ...(version ? { "If-Match": String(version) } : {}),
});

export const eventWebsiteBuilder = {
  getDraft: (eventId: string) =>
    apiClient.get<WebsiteDraftRecord>(`/events/${eventId}/website`),

  acquireEditorSession: (eventId: string) =>
    apiClient.post<WebsiteEditorSessionRecord>(`/events/${eventId}/website/editor-session`),

  releaseEditorSession: (eventId: string) =>
    apiClient.delete(`/events/${eventId}/website/editor-session`),

  createPreview: (eventId: string, document: WebsiteDocument, previewId?: string) =>
    apiClient.post<WebsitePreviewRecord>(`/events/${eventId}/website/preview`, {
      document,
      schema_version: document.schemaVersion,
      checksum: document.checksum,
      preview_id: previewId,
    }),

  saveDraft: (eventId: string, version: number, document: WebsiteDocument) =>
    apiClient.put<WebsiteDraftRecord>(
      `/events/${eventId}/website/draft`,
      {
        document,
        schema_version: document.schemaVersion,
        checksum: document.checksum,
      },
      { headers: mutationHeaders(version) },
    ),

  validate: (eventId: string, document: WebsiteDocument) =>
    apiClient.post<WebsiteValidationResult>(
      `/events/${eventId}/website/validate`,
      {
        document,
        schema_version: document.schemaVersion,
        checksum: document.checksum,
      },
    ),

  checkpoint: (eventId: string) =>
    apiClient.post<WebsiteCheckpointResult>(
      `/events/${eventId}/website/checkpoint`,
      undefined,
      { headers: mutationHeaders() },
    ),

  fetchEventSnapshot: (eventId: string) =>
    apiClient.post<WebsiteEventSnapshot>(`/events/${eventId}/website/event-snapshot`),

  publish: (eventId: string, options: { slug: string; customDomain?: string }) =>
    apiClient.post<WebsiteDeploymentRecord>(
      `/events/${eventId}/website/publish`,
      { slug: options.slug, custom_domain: options.customDomain },
      { headers: mutationHeaders() },
    ),

  getCurrentDeployment: (eventId: string) =>
    apiClient.get<WebsiteDeploymentRecord>(`/events/${eventId}/website/deployments/current`),

  listRevisions: (eventId: string) =>
    apiClient.get<WebsiteRevisionSummary[]>(`/events/${eventId}/website/revisions`),

  rollback: (eventId: string, revisionId: string) =>
    apiClient.post<WebsiteDeploymentRecord>(
      `/events/${eventId}/website/rollback`,
      { revision_id: revisionId },
      { headers: mutationHeaders() },
    ),

  listAssets: (eventId: string) =>
    apiClient.get<WebsiteAssetReferenceRecord[]>(`/events/${eventId}/website/assets`),

  saveAsset: (eventId: string, asset: WebsiteAsset) =>
    apiClient.post<WebsiteAssetReferenceRecord>(
      `/events/${eventId}/website/assets`,
      {
        kind: asset.type === "upload" ? "image" : asset.type,
        source: asset.source || "manual",
        url: asset.url,
        creator: asset.creator,
        license: asset.license,
        attribution: asset.attribution,
        metadata: {
          title: asset.title,
          svg: asset.svg,
          savedAt: asset.savedAt,
          sourceAssetId: asset.id,
        },
      },
      { headers: mutationHeaders() },
    ),

  uploadAsset: (eventId: string, file: File) => {
    const data = new FormData();
    data.append("file", file);
    return apiClient.post<WebsiteAssetReferenceRecord>(
      `/events/${eventId}/website/assets/upload`,
      data,
      { headers: { "Content-Type": "multipart/form-data", "Idempotency-Key": crypto.randomUUID() } },
    );
  },

  searchOpenverse: (eventId: string, q: string) =>
    apiClient.get<OpenverseImageResult[]>(`/events/${eventId}/website/assets/openverse`, { params: { q } }),

  listDomains: (eventId: string) =>
    apiClient.get<WebsiteDomainRecord[]>(`/events/${eventId}/website/domains`),

  createDomain: (eventId: string, domain: string) =>
    apiClient.post<WebsiteDomainRecord>(
      `/events/${eventId}/website/domains`,
      { domain },
      { headers: mutationHeaders() },
    ),

  refreshDomain: (eventId: string, domainId: string) =>
    apiClient.post<WebsiteDomainRecord>(
      `/events/${eventId}/website/domains/${domainId}/refresh`,
      undefined,
      { headers: mutationHeaders() },
    ),

  deleteDomain: (eventId: string, domainId: string) =>
    apiClient.delete(`/events/${eventId}/website/domains/${domainId}`, { headers: mutationHeaders() }),
};
