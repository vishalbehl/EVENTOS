import { apiClient } from "@/lib/api-client";
import type { WebsiteAsset, WebsiteDocument } from "@eventos/website-builder-studio";

export type WebsiteTemplateDraftRecord = {
  template_id: string;
  draft_id: string;
  name: string;
  slug: string;
  document: WebsiteDocument;
  schema_version: number;
  checksum: string;
  version: number;
  updated_at: string;
};

export type WebsiteTemplateValidationResult = {
  valid: boolean;
  diagnostics: Array<Record<string, unknown>>;
};

export type WebsiteTemplatePublishResult = {
  template_id: string;
  version_id: string;
  version_number: number;
  checksum: string;
};

export type WebsiteTemplatePreviewResult = {
  preview_id: string;
  url: string;
  checksum: string;
  expires_at: string;
};

type OpenverseImageResult = {
  id: string;
  title: string;
  url?: string;
  thumbnail?: string;
  creator?: string;
  source?: string;
  license?: string;
  attribution?: string;
};

const mutationHeaders = (version?: number) => ({
  "Idempotency-Key": crypto.randomUUID(),
  ...(version ? { "If-Match": String(version) } : {}),
});

export const platformWebsiteTemplates = {
  getMasterDraft: () =>
    apiClient.get<WebsiteTemplateDraftRecord>("/platform/website-templates/master/draft"),

  saveMasterDraft: (version: number, document: WebsiteDocument) =>
    apiClient.put<WebsiteTemplateDraftRecord>(
      "/platform/website-templates/master/draft",
      {
        document,
        schema_version: document.schemaVersion,
        checksum: document.checksum,
      },
      { headers: mutationHeaders(version) },
    ),

  validateMaster: (document: WebsiteDocument) =>
    apiClient.post<WebsiteTemplateValidationResult>(
      "/platform/website-templates/master/validate",
      {
        document,
        schema_version: document.schemaVersion,
        checksum: document.checksum,
      },
    ),

  createPreview: (document: WebsiteDocument, previewId?: string) =>
    apiClient.post<WebsiteTemplatePreviewResult>(
      "/platform/website-templates/master/preview",
      {
        document,
        schema_version: document.schemaVersion,
        checksum: document.checksum,
        preview_id: previewId,
      },
    ),

  searchOpenverse: async (query: string): Promise<WebsiteAsset[]> => {
    const results = await apiClient.get<OpenverseImageResult[]>(
      `/platform/website-templates/assets/openverse?q=${encodeURIComponent(query)}&page_size=24`,
    );
    return results.filter(item => Boolean(item.url)).map(item => ({
      id: `openverse_${item.id}`,
      type: 'image',
      title: item.title,
      url: item.url,
      thumbnailUrl: item.thumbnail,
      source: 'openverse',
      license: item.license,
      attribution: item.attribution || [item.title, item.creator, item.license].filter(Boolean).join(' - '),
      sourceUrl: item.source,
      savedAt: new Date().toISOString(),
    }));
  },

  publishMaster: () =>
    apiClient.post<WebsiteTemplatePublishResult>(
      "/platform/website-templates/master/publish",
      undefined,
      { headers: mutationHeaders() },
    ),
};
