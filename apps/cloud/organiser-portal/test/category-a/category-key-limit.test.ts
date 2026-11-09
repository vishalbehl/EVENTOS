// Request-shape checks only; this does not replace connected browser/API proof.
import { beforeEach, expect, it, vi } from "vitest";
import { organiserFormService } from "@/services/form-template-service";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiGet: api.get, apiPost: api.post, apiPatch: api.patch, apiDelete: api.delete }));
vi.mock("@eventos/form-builder-studio", () => ({
  catalogueDocumentForSave: (fields: unknown[], settings: object) => ({ fields, settings }),
  eventFormDocumentForSave: (fields: unknown[], settings: object) => ({ fields, settings }),
}));

beforeEach(() => vi.clearAllMocks());

it.each([51, 100])("preserves a %i-character taxonomy key through create and list", async length => {
  const key = "x".repeat(length);
  await organiserFormService.createCustomTemplate({ name: "Long taxonomy", category_key: key }, "stable-create");
  expect(api.post).toHaveBeenCalledWith("/forms/templates",
    expect.objectContaining({ category_key: key, scope_type: "ORGANIZATION" }),
    { headers: { "Idempotency-Key": "stable-create" } });
  await organiserFormService.listTemplatePage({ category_key: key, page_size: "50" });
  expect(api.get).toHaveBeenCalledWith(`/forms/templates?category_key=${key}&page_size=50`);
});
