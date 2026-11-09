import { expect, it, vi } from "vitest";
import type { FormTemplate, FormSettings } from "@eventos/form-builder-studio";
import { loadRegistrationEditor, ObsoleteEditorLoad } from "@/lib/registration-editor-load";

const field = { id: "server-field", type: "text" as const, label: "Server field", name: "server_field", sort_order: 0,
  is_required: false, is_active: true, is_default: false, grid_width: "full" as const };
const config = () => ({ id: "config", event_id: "event", version: 4, is_live: false, fields: [field], settings: {} });
const template = (patch: Partial<FormTemplate> = {}): FormTemplate => ({ id: "source", name: "Server source",
  slug: "server-source", category_key: "registration", scope_type: "ORGANIZATION", version: 2,
  is_active: true, is_default: false, is_system: false, fields: [field], settings: {}, ...patch });
const reader = () => ({ getEventFormConfig: vi.fn().mockResolvedValue(config()), getTemplate: vi.fn().mockResolvedValue(template()) });

it.each([401, 403, 404, 409, 429, 503])("never substitutes a local document for failed required template read (%s)", async status => {
  const service = reader();
  const error = { status };
  service.getTemplate.mockRejectedValue(error);
  await expect(loadRegistrationEditor("event", "tpl_standard_registration", service, () => true)).rejects.toBe(error);
  expect(service.getTemplate).toHaveBeenCalledTimes(1);
  expect(service.getTemplate).toHaveBeenCalledWith("tpl_standard_registration", "event");
});

it("preserves an ambiguous legacy-selector conflict without guessing a document or retrying", async () => {
  const service = reader();
  const error = { status: 409, detail: { code: "AMBIGUOUS_FORM_TEMPLATE", action: "SELECT_TEMPLATE_BY_ID" } };
  service.getTemplate.mockRejectedValue(error);
  await expect(loadRegistrationEditor("event", "legacy_slug", service, () => true)).rejects.toBe(error);
  expect(service.getTemplate).toHaveBeenCalledExactlyOnceWith("legacy_slug", "event");
});

it("retains intentionally empty server fields, with no synthetic default or reset", async () => {
  const service = reader();
  service.getEventFormConfig.mockResolvedValue({ ...config(), fields: [] });
  const result = await loadRegistrationEditor("event", "", service, () => true);
  expect(result.fields).toEqual([]);
  expect(result.blueprint).toBeNull();
  expect(service.getTemplate).not.toHaveBeenCalled();
});

it("uses a verified selected blueprint and the loaded aggregate version", async () => {
  const service = reader();
  const result = await loadRegistrationEditor("event", "source", service, () => true);
  expect(result).toMatchObject({ version: 4, isLive: false, sourceTemplateId: "source", eventCopyTemplateId: null,
    blueprint: { name: "Server source", fields: [field] } });
});

it("preserves the active aggregate when its original source was selected", async () => {
  const service = reader();
  service.getEventFormConfig.mockResolvedValue({ ...config(), template_id: "copy",
    settings: { _source_template_id: "source" } });
  service.getTemplate.mockResolvedValueOnce(template({ id: "copy", scope_type: "EVENT", event_id: "event",
    fields: [], settings: { _event_id: "event", _source_template_id: "source" } as FormSettings }))
    .mockResolvedValueOnce(template());
  const result = await loadRegistrationEditor("event", "source", service, () => true);
  expect(result.fields).toEqual([field]);
  expect(result.eventCopyTemplateId).toBe("copy");
  expect(service.getTemplate.mock.calls).toEqual([["copy", "event"], ["source", "event"]]);
});

it("keeps a valid current form editable but explicitly disables an unavailable reset", async () => {
  const service = reader();
  service.getEventFormConfig.mockResolvedValue({ ...config(), template_id: "copy" });
  service.getTemplate.mockResolvedValueOnce(template({ id: "copy", scope_type: "EVENT", event_id: "event",
    settings: { _event_id: "event", _source_template_id: "retired-root" } as FormSettings }))
    .mockRejectedValueOnce({ status: 404 });
  const result = await loadRegistrationEditor("event", "", service, () => true);
  expect(result.fields).toEqual([field]);
  expect(result.blueprint).toBeNull();
  expect(result.blueprintNotice).toContain("reset is disabled");
  expect(service.getTemplate).toHaveBeenCalledTimes(2);
});

it("rejects conflicting event markers instead of treating another copy as active", async () => {
  const service = reader();
  service.getTemplate.mockResolvedValue(template({ scope_type: "EVENT", event_id: "other-event",
    settings: { _event_id: "event" } as FormSettings }));
  await expect(loadRegistrationEditor("event", "source", service, () => true)).rejects.toThrow("event template is unavailable");
});

it("rejects a non-registration or retired target", async () => {
  for (const patch of [{ category_key: "survey" }, { is_active: false }]) {
    const service = reader();
    service.getTemplate.mockResolvedValue(template(patch));
    await expect(loadRegistrationEditor("event", "source", service, () => true)).rejects.toThrow("registration template is unavailable");
  }
});

it("does not publish a response completed after its scope became obsolete", async () => {
  const service = reader();
  let current = true;
  service.getTemplate.mockImplementation(async () => { current = false; return template(); });
  await expect(loadRegistrationEditor("event", "source", service, () => current)).rejects.toBeInstanceOf(ObsoleteEditorLoad);
});

it.each([
  { event_id: "other-event" },
  { version: 0 },
  { fields: Array.from({ length: 101 }, () => field) },
])("rejects foreign, unversioned or oversized aggregate responses", async patch => {
  const service = reader();
  service.getEventFormConfig.mockResolvedValue({ ...config(), ...patch });
  await expect(loadRegistrationEditor("event", "", service, () => true)).rejects.toThrow("server form document is invalid");
  expect(service.getTemplate).not.toHaveBeenCalled();
});
