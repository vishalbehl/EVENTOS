// Request-shape checks only; persistence/RLS proof is the PostgreSQL rehearsal.
import { beforeEach, expect, it, vi } from "vitest";
import { platformFormService } from "@/services/form-template-service";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiClient: api }));
vi.mock("@eventos/form-builder-studio", () => ({
  catalogueDocumentForSave: (fields: unknown[], settings: object) => ({ fields, settings }),
}));

beforeEach(() => vi.clearAllMocks());

it.each([51, 100])("preserves a %i-character taxonomy key through create, update and list", async length => {
  const key = "x".repeat(length);
  await platformFormService.createTemplate({ name: "Long taxonomy", category_key: key }, "stable-create");
  expect(api.post).toHaveBeenCalledWith("/platform/forms/templates",
    expect.objectContaining({ category_key: key }), { headers: { "Idempotency-Key": "stable-create" } });
  await platformFormService.updateTemplate("template", { category_key: key }, { version: 7, key: "stable-update" });
  expect(api.put).toHaveBeenCalledWith("/platform/forms/templates/template", { category_key: key },
    { headers: { "If-Match": "7", "Idempotency-Key": "stable-update" } });
  await platformFormService.listTemplatePage({ category_key: key, page_size: 50 });
  expect(api.get).toHaveBeenCalledWith("/platform/forms/templates", { params: { category_key: key, page_size: 50 } });
});
