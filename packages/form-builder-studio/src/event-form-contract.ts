import { catalogueDocumentForSave } from "./catalogue-contract";
import type { FormField, FormSettings } from "./types";

/** Server-owned provenance is never part of a caller's document save. */
export function eventFormDocumentForSave(fields: FormField[], settings: FormSettings) {
  const document = catalogueDocumentForSave(fields, settings);
  return { fields: document.fields, settings: {
    ...document.settings, allow_drafts: settings.allow_drafts, show_word_count: settings.show_word_count,
  } };
}

export function rubricForSave(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid rubric.");
  const labels = new Set<string>();
  const keys = new Set<string>();
  let total = 0;
  const rows = value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid rubric criterion.");
    const row = item as Record<string, unknown>;
    const label = row.label;
    const weight = row.weight;
    const maximum = row.max === undefined ? 10 : row.max;
    const key = row.key;
    if (typeof label !== "string" || !label.trim() || label.length > 255 ||
        typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 100 ||
        typeof maximum !== "number" || !Number.isFinite(maximum) || maximum <= 0 || maximum > 1000 ||
        (key !== undefined && (typeof key !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(key))) ||
        (row.description !== undefined && (typeof row.description !== "string" || row.description.length > 2000))) {
      throw new Error("Invalid rubric label, weight or scoring range.");
    }
    const identity = label.trim().toLowerCase();
    if (labels.has(identity) || (typeof key === "string" &&
        (keys.has(key) || ["__proto__", "prototype", "constructor"].includes(key)))) {
      throw new Error("Rubric criteria must use unique, safe identifiers.");
    }
    labels.add(identity);
    if (typeof key === "string") keys.add(key);
    total += weight;
    return { label, weight, max: maximum,
      description: row.description === undefined ? "" : row.description,
      ...(typeof key === "string" ? { key } : {}) };
  });
  if (rows.length && Math.abs(total - 100) > 0.000001) throw new Error("Rubric weights must total 100%.");
  return rows;
}

export function abstractSchemaForSave(schema: Record<string, unknown>) {
  if (Object.keys(schema).some(key => !["fields", "settings", "template_id", "rubric"].includes(key))) {
    throw new Error("Unsupported abstract form configuration. Reload the current document.");
  }
  if (!Array.isArray(schema.fields) || (schema.settings !== undefined &&
      (!schema.settings || typeof schema.settings !== "object" || Array.isArray(schema.settings)))) {
    throw new Error("Invalid abstract form document.");
  }
  const document = eventFormDocumentForSave(schema.fields as FormField[], (schema.settings || {}) as FormSettings);
  return { ...document,
    ...(schema.template_id !== undefined ? { template_id: schema.template_id } : {}),
    ...(schema.rubric !== undefined ? { rubric: rubricForSave(schema.rubric) } : {}),
  };
}
