"use client";

import { EmailBuilderStudio, type StudioAsset, type StudioDraft, type StudioFragment, type StudioTemplate } from "@eventos/email-builder-studio";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { platformEmailAssets, platformEmailComponents, platformEmailTemplates, type EmailAssetRecord, type EmailFragmentRecord, type EmailStudioRecord } from "@/services/email-template-studio-service";

const VARIABLES = [
  { key: "{{EventName}}", label: "Event name", required: true },
  { key: "{{SpeakerName}}", label: "Speaker name" },
  { key: "{{UploadLink}}", label: "Upload link" },
  { key: "{{EventDate}}", label: "Event date" },
  { key: "{{EventVenue}}", label: "Venue" },
];

function toStudio(row: EmailStudioRecord): StudioTemplate {
  const candidate = row.designer_json as { root?: unknown } | null | undefined;
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    preheader: row.preheader ?? "",
    stableKey: row.stable_key,
    scopeType: row.scope_type,
    organizationId: row.organization_id ?? null,
    lifecycleState: row.lifecycle_state,
    version: row.version,
    designerJson: candidate?.root ? row.designer_json as StudioTemplate["designerJson"] : null,
    bodyHtml: row.body_html,
    editable: row.editable,
    effectiveOrigin: row.effective_origin,
    fallbackReason: row.fallback_reason,
  };
}

export default function EmailTemplateStudioScreen() {
  const [rows, setRows] = useState<EmailStudioRecord[]>([]);
  const [fragmentRows, setFragmentRows] = useState<EmailFragmentRecord[]>([]);
  const [assetRows, setAssetRows] = useState<EmailAssetRecord[]>([]);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; slug?: string }>>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, savedFragments, savedAssets, orgs] = await Promise.all([
        platformEmailTemplates.list(),
        platformEmailComponents.list(),
        platformEmailAssets.list(),
        platformEmailTemplates.listOrganizations().catch(() => []),
      ]);
      setRows(result);
      setFragmentRows(savedFragments);
      setAssetRows(savedAssets);
      setOrganizations(orgs);
      setActiveId((current) => current && result.some((row) => row.id === current) ? current : result[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template library is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const templates = useMemo(() => rows.map(toStudio), [rows]);

  const replace = (saved: EmailStudioRecord, previousId = saved.id) => {
    setRows((current) => [saved, ...current.filter((row) => row.id !== previousId && row.id !== saved.id)]);
    setActiveId(saved.id);
  };

  const saveDraft = async (draft: StudioDraft) => {
    try {
      const saved = await platformEmailTemplates.saveDraft(draft.templateId, draft.expectedVersion, {
        name: draft.name,
        subject: draft.subject,
        preheader: draft.preheader ?? "",
        body_html: draft.bodyHtml,
        designer_json: draft.designerJson,
        editor_schema_version: draft.editorSchemaVersion,
      });
      replace(saved, draft.templateId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save draft.");
      throw error;
    }
  };

  const publish = async (template: StudioTemplate, reason: string) => {
    setBusy(true);
    try {
      replace(await platformEmailTemplates.publish(template.id, template.version, reason.trim()));
      toast.success("Platform email template published.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template could not be published.");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const preview = async (draft: StudioDraft) => {
    const result = await platformEmailTemplates.preview(draft.templateId, { name: draft.name, subject: draft.subject, preheader: draft.preheader ?? "", body_html: draft.bodyHtml, designer_json: draft.designerJson, editor_schema_version: draft.editorSchemaVersion });
    return { html: result.html, plainText: result.plain_text, diagnostics: result.diagnostics };
  };

  const sendTest = async (draft: StudioDraft, recipient: string) => {
    try {
      await platformEmailTemplates.testSend(draft.templateId, recipient, { name: draft.name, subject: draft.subject, preheader: draft.preheader ?? "", body_html: draft.bodyHtml, designer_json: draft.designerJson, editor_schema_version: draft.editorSchemaVersion });
      toast.success(`Test email queued for ${recipient}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send test email.");
      throw error;
    }
  };
  const saveFragment = async (fragment: { name: string; componentKind: "BLOCK" | "SECTION"; documentFragment: Record<string, unknown> }) => {
    try {
      const stableKey = `${fragment.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fragment"}-${Date.now().toString(36)}`;
      const saved = await platformEmailComponents.create({ name: fragment.name, stable_key: stableKey, component_kind: fragment.componentKind, category: "saved", document_fragment: fragment.documentFragment, preview_metadata: {} });
      setFragmentRows((current) => [saved, ...current]);
      toast.success("Reusable email fragment saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save fragment.");
      throw error;
    }
  };
  const fragments: StudioFragment[] = fragmentRows.map((row) => ({ id: row.id, name: row.name, category: row.category, componentKind: row.component_kind, scopeType: row.scope_type, documentFragment: row.document_fragment, editable: row.editable }));
  const assets: StudioAsset[] = assetRows.map((row) => ({ id: row.id, name: row.name, url: row.url, fileType: row.file_type, scopeType: row.scope_type, assetKind: row.asset_kind, sourceType: row.source_type, width: row.width ?? undefined, height: row.height ?? undefined, metadata: row.metadata }));
  const uploadAsset = async (file: File, assetKind: "IMAGE" | "ICON" = "IMAGE") => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const mockAsset: EmailAssetRecord = {
          id: `local-${Date.now()}`,
          name: file.name,
          url: dataUrl,
          file_type: file.type,
          scope_type: "PLATFORM",
          asset_kind: assetKind,
          source_type: "UPLOAD",
          metadata: {},
        };
        setAssetRows((current) => [mockAsset, ...current]);
        resolve(dataUrl);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const create = async ({ name, stableKey }: { name: string; stableKey: string }) => {
    setBusy(true);
    try {
      const saved = await platformEmailTemplates.create({ name, stable_key: stableKey, template_type: "custom", target_type: "speaker" });
      replace(saved);
      toast.success("Platform template draft created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template could not be created.");
      throw error;
    } finally { setBusy(false); }
  };

  const loadVersions = async (template: StudioTemplate) => (await platformEmailTemplates.versions(template.id)).map((version) => ({ id: version.id, version: version.version_number, lifecycleState: version.lifecycle_state, publishedAt: version.published_at }));

  const rollback = async (template: StudioTemplate, versionId: string, reason: string) => {
    setBusy(true);
    try {
      replace(await platformEmailTemplates.rollback(template.id, template.version, versionId, reason.trim()));
      toast.success("Historical version restored as a new immutable publication.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template could not be rolled back.");
      throw error;
    } finally { setBusy(false); }
  };

  const deleteTemplate = async (templateId: string) => {
    setBusy(true);
    try {
      await platformEmailTemplates.delete(templateId);
      setRows((current) => current.filter((row) => row.id !== templateId));
      toast.success("Platform template deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template could not be deleted.");
    } finally { setBusy(false); }
  };

  const duplicateTemplate = async (templateId: string) => {
    setBusy(true);
    try {
      const saved = await platformEmailTemplates.duplicate(templateId);
      replace(saved);
      setActiveId(saved.id);
      toast.success("Template duplicated successfully.");
      return toStudio(saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template could not be duplicated.");
    } finally { setBusy(false); }
  };

  const updateScope = async (templateId: string, scopeType: "PLATFORM" | "ORGANIZATION", organizationId?: string | null) => {
    setBusy(true);
    try {
      const updated = await platformEmailTemplates.updateScope(templateId, scopeType, organizationId);
      replace(updated);
      toast.success("Template tenant scope updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scope assignment could not be updated.");
    } finally { setBusy(false); }
  };

  if (loading) return <div className="grid h-full min-h-0 flex-1 place-items-center text-sm text-[var(--text-tertiary)]">Loading authoritative template versions…</div>;

  return <EmailBuilderStudio templates={templates} fragments={fragments} assets={assets} activeTemplateId={activeId} variables={VARIABLES} scopeLabel="Command Center · platform defaults" busy={busy} organizations={organizations} onSelectTemplate={setActiveId} onCreateTemplate={create} onSaveDraft={saveDraft} onDeleteTemplate={deleteTemplate} onDuplicateTemplate={duplicateTemplate} onUpdateScope={updateScope} onPublish={publish} onLoadVersions={loadVersions} onRollback={rollback} onPreview={preview} onSendTest={sendTest} onSaveFragment={saveFragment} onUploadAsset={uploadAsset} />;
}
