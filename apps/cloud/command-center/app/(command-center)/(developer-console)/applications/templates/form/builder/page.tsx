"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FormBuilderStudio, FormTemplate, FormField, FormSettings, catalogueDocumentForSave } from "@eventos/form-builder-studio";
import { platformFormService } from "@/services/form-template-service";
import { useCatalogueCommand } from "@/hooks/useCatalogueCommand";
import { useAuthStore } from "@/store/use-auth-store";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";

function ScopedBuilder() {
  const { user, isAuthenticated } = useAuthStore();
  const id = useSearchParams().get("id");
  if (!isAuthenticated) return <p role="status">Sign in to manage the catalogue.</p>;
  return <FormBuilderContent key={`${user?.id}:${user?.organization_id}:${id}`} templateId={id} />;
}

function FormBuilderContent({ templateId }: { templateId: string | null }) {
  const router = useRouter();
  const command = useCatalogueCommand();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTemplate(null);
    if (!templateId) {
      setError("Select a persisted blueprint from the catalogue first.");
      setLoading(false);
      return;
    }
    void platformFormService.getTemplate(templateId).then(result => {
      if (!cancelled && command.isCurrent()) setTemplate(result);
    }).catch((problem: unknown) => {
      if (!cancelled && command.isCurrent()) setError(problem instanceof Error ? problem.message : "Blueprint unavailable.");
    }).finally(() => {
      if (!cancelled && command.isCurrent()) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [templateId, reload, command.isCurrent]);

  const handleSave = async (data: { fields: FormField[]; settings: FormSettings; is_live: boolean }) => {
    if (!template?.version) {
      toast.error("Reload the persisted blueprint before saving.");
      return;
    }
    try {
      const document = catalogueDocumentForSave(data.fields, data.settings);
      const saved = await command.execute<FormTemplate>("put", `/platform/forms/templates/${template.id}`, {
        name: template.name,
        description: template.description,
        category_key: template.category_key,
        ...document,
        is_active: data.is_live,
      }, template.version);
      if (!saved || !command.isCurrent()) return;
      setTemplate(saved);
      toast.success("Blueprint saved.");
    } catch (problem: unknown) {
      if (command.isCurrent()) toast.error(problem instanceof Error ? problem.message : "Blueprint was not saved.");
    }
  };

  if (loading) return <PageContainer className="p-0"><p role="status">Loading Form Studio…</p></PageContainer>;
  if (error || !template) return <PageContainer className="p-0"><p role="alert">{error || "Blueprint unavailable."}</p>
    <button type="button" onClick={() => setReload(value => value + 1)}>Reload blueprint</button>
    <button type="button" onClick={() => router.push("/applications/templates/form")}>Back to catalogue</button>
  </PageContainer>;
  return <PageContainer className="p-0">
    {command.failure ? <p role="alert">{command.failure.message}
      {command.failure.retryAfter ? ` Retry after ${command.failure.retryAfter} seconds.` : ""}
      {command.failure.correlationId ? ` Reference: ${command.failure.correlationId}` : ""}
    </p> : null}
    <fieldset disabled={command.pending} aria-busy={command.pending}>
      <FormBuilderStudio initialFields={template.fields || []} initialSettings={template.settings || {}}
        templateName={template.name} categoryName={template.category_name || template.category_key}
        isLive={template.is_active} mode="command-center" onSave={handleSave}
        onBack={() => router.push("/applications/templates/form")}
        onBrowseTemplates={() => router.push("/applications/templates/form")} />
    </fieldset>
  </PageContainer>;
}

export default function CommandCenterFormBuilderPage() {
  return <Suspense fallback={<p role="status">Loading Form Studio…</p>}><ScopedBuilder /></Suspense>;
}
