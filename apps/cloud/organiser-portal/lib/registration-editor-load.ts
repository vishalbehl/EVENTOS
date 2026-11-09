import type { FormField, FormSettings, FormTemplate } from "@eventos/form-builder-studio";
import type { EventFormConfig } from "@/services/form-template-service";

type Reader = {
  getEventFormConfig(eventId: string): Promise<EventFormConfig>;
  getTemplate(id: string, eventId: string): Promise<FormTemplate>;
};
export type RegistrationBlueprint = { name: string; fields: FormField[]; settings: FormSettings };

export class ObsoleteEditorLoad extends Error {}

const metadata = (settings: FormSettings | undefined, key: string): string | null => {
  const value = (settings as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

/** At most one config, one target and one optional historical root read.
 * No local document is a substitute for a denied or unavailable server record.
 */
export async function loadRegistrationEditor(eventId: string, templateId: string,
  reader: Reader, isCurrent: () => boolean) {
  const current = () => { if (!isCurrent()) throw new ObsoleteEditorLoad(); };
  current();
  const config = await reader.getEventFormConfig(eventId);
  current();
  if (config.event_id !== eventId || !Number.isInteger(config.version) || config.version < 1 ||
      !Array.isArray(config.fields) || config.fields.length > 100) {
    throw new Error("The server form document is invalid.");
  }
  const active = !templateId || [config.template_id,
    metadata(config.settings, "_source_template_id"), metadata(config.settings, "template_slug")].includes(templateId);
  const targetId = active ? config.template_id : templateId;
  let target: FormTemplate | null = null;
  if (targetId) {
    target = await reader.getTemplate(targetId, eventId);
    current();
    if (!target || !Array.isArray(target.fields) || target.fields.length > 100 ||
        target.category_key !== "registration" || !target.is_active) {
      throw new Error("The requested registration template is unavailable.");
    }
    if (target.scope_type === "EVENT") {
      const markers = [target.event_id, metadata(target.settings, "_event_id"), metadata(target.settings, "event_id")]
        .filter((value): value is string => value !== null && value !== undefined);
      if (!markers.length || markers.some(value => value !== eventId)) {
        throw new Error("The requested event template is unavailable.");
      }
    }
  }
  let blueprint: RegistrationBlueprint | null = null;
  let blueprintNotice = "No original server blueprint is linked. Reset is unavailable.";
  if (target && target.scope_type !== "EVENT") {
    blueprint = { name: target.name, fields: target.fields, settings: target.settings || {} };
  } else if (target) {
    const rootId = metadata(target.settings, "_source_template_id");
    if (rootId && rootId !== target.id) {
      try {
        const root = await reader.getTemplate(rootId, eventId);
        current();
        if (root && root.scope_type !== "EVENT" && root.is_active && root.category_key === "registration" &&
            Array.isArray(root.fields) && root.fields.length <= 100) {
          blueprint = { name: root.name, fields: root.fields, settings: root.settings || {} };
        }
      } catch {
        current();
      }
      blueprintNotice = "The original server blueprint is unavailable. Your current form can be edited, but reset is disabled.";
    }
  }
  current();
  return {
    version: config.version, isLive: config.is_live,
    fields: (active ? config.fields : target!.fields).map((field, index) => ({ ...field, sort_order: field.sort_order ?? index })),
    settings: (active ? config.settings : target!.settings) || {},
    title: target?.name ?? null, categoryName: target?.category_name || "Registration Form",
    eventCopyTemplateId: target?.scope_type === "EVENT" ? target.id : null,
    sourceTemplateId: target && target.scope_type !== "EVENT" ? target.id : null,
    blueprint, blueprintNotice: blueprint ? null : blueprintNotice,
  };
}
