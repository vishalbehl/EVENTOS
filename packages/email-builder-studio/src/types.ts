import type { TReaderDocument } from "@usewaypoint/email-builder";

export type EmailDocument = TReaderDocument;

export type StudioTemplate = {
  id: string;
  name: string;
  subject: string;
  preheader?: string;
  stableKey: string;
  scopeType: "PLATFORM" | "ORGANIZATION" | "EVENT";
  organizationId?: string | null;
  lifecycleState: "DRAFT" | "PUBLISHED" | "ARCHIVED" | "LEGACY";
  version: number;
  designerJson: EmailDocument | null;
  bodyHtml: string;
  editable: boolean;
  effectiveOrigin?: "PLATFORM" | "ORGANIZATION" | "EVENT";
  fallbackReason?: string | null;
};

export type StudioDraft = {
  templateId: string;
  name: string;
  subject: string;
  preheader?: string;
  designerJson: EmailDocument;
  bodyHtml: string;
  editorSchemaVersion: number;
  expectedVersion: number;
};

export type StudioVariable = {
  key: string;
  label: string;
  required?: boolean;
  sampleValue?: string;
};

export type StudioFragment = {
  id: string;
  name: string;
  category: string;
  componentKind: "BLOCK" | "SECTION";
  scopeType: "PLATFORM" | "ORGANIZATION" | "EVENT";
  documentFragment: Record<string, unknown>;
  editable: boolean;
};

export type StudioAsset = {
  id: string;
  name: string;
  url: string;
  fileType: string;
  scopeType: "PLATFORM" | "ORGANIZATION" | "EVENT";
  assetKind?: "IMAGE" | "ICON";
  sourceType?: "UPLOAD" | "URL_IMPORT" | "BUILTIN_ICON" | "DERIVED";
  folderId?: string | null;
  tags?: string[];
  width?: number | null;
  height?: number | null;
  editable?: boolean;
  metadata?: Record<string, unknown>;
};
export type StudioBrandingPolicy = {
  enabled: boolean;
  text: string;
  iconUrl?: string | null;
  destinationUrl?: string | null;
  version: number;
  editable?: boolean;
};
export type StudioDiagnostic = {
  path: string;
  message: string;
  severity: "error" | "warning";
};
export type StudioPreviewResult = {
  html: string;
  plainText: string;
  diagnostics: StudioDiagnostic[];
};
export type StudioVersion = {
  id: string;
  version: number;
  lifecycleState: string;
  publishedAt?: string | null;
};

export type EmailBuilderStudioProps = {
  templates: StudioTemplate[];
  activeTemplateId?: string | null;
  variables: StudioVariable[];
  sampleValues?: Record<string, string>;
  sampleCollections?: Record<string, Array<Record<string, string>>>;
  fragments?: StudioFragment[];
  assets?: StudioAsset[];
  brandingPolicy?: StudioBrandingPolicy;
  readOnly?: boolean;
  busy?: boolean;
  scopeLabel: string;
  organizations?: Array<{ id: string; name: string; slug?: string }>;
  onSelectTemplate?: (id: string) => void;
  onDeleteTemplate?: (id: string) => Promise<void> | void;
  onDuplicateTemplate?: (id: string) => Promise<StudioTemplate | void>;
  onUpdateScope?: (
    id: string,
    scopeType: "PLATFORM" | "ORGANIZATION",
    organizationId?: string | null,
  ) => Promise<void>;
  onRequestCreateNew?: () => void;
  onCreateTemplate?: (template: {
    name: string;
    stableKey: string;
  }) => Promise<void>;
  onSaveDraft: (draft: StudioDraft) => Promise<void>;
  onPublish?: (template: StudioTemplate, reason: string) => Promise<void>;
  onLoadVersions?: (template: StudioTemplate) => Promise<StudioVersion[]>;
  onRollback?: (
    template: StudioTemplate,
    versionId: string,
    reason: string,
  ) => Promise<void>;
  onUploadAsset?: (
    file: File,
    assetKind?: "IMAGE" | "ICON",
  ) => Promise<string>;
  onImportAsset?: (
    url: string,
    assetKind: "IMAGE" | "ICON",
  ) => Promise<StudioAsset>;
  onUpdateAsset?: (
    asset: StudioAsset,
    patch: { name?: string; folderId?: string | null; tags?: string[] },
  ) => Promise<StudioAsset>;
  onDeleteAsset?: (asset: StudioAsset) => Promise<void>;
  onPreview?: (draft: StudioDraft) => Promise<StudioPreviewResult>;
  onSendTest?: (draft: StudioDraft, recipient: string) => Promise<void>;
  onSaveFragment?: (fragment: {
    name: string;
    componentKind: "BLOCK" | "SECTION";
    documentFragment: Record<string, unknown>;
  }) => Promise<void>;
  onArchive?: (template: StudioTemplate) => Promise<void>;
  onExit?: () => void;
};
