"use client";

import type { FormTemplate, FormField, FormSettings } from "@eventos/form-builder-studio";
import { eventFormDocumentForSave } from "@eventos/form-builder-studio";
import { useScopedCommand } from "@/hooks/useScopedCommand";

export function useEventTemplateCopy(eventId: string) {
  const command = useScopedCommand(eventId);
  const save = async (target: FormTemplate, data: {
    fields: FormField[]; settings?: FormSettings; name?: string;
  }) => {
    if (target.category_key === "registration") {
      throw new Error("Use the registration form builder to save its versioned binding.");
    }
    if (target.category_key === "abstract") {
      throw new Error("Use the abstract form builder to save the template and active form together.");
    }
    return command.execute<FormTemplate>("post",
      `/forms/templates/${target.id}/save-as-event-copy`,
      { event_id: eventId, name: data.name, ...eventFormDocumentForSave(data.fields, data.settings || {}) }, target.version);
  };
  const selectTarget = (source: FormTemplate, templates: FormTemplate[]) =>
    source.scope_type === "EVENT" ? source : templates.find(template =>
      template.scope_type === "EVENT" && template.event_id === eventId &&
      (template.settings as unknown as Record<string, unknown>)?._source_template_id === source.id) || source;
  return { ...command, save, selectTarget };
}
