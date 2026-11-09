import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/utils";

describe("publication conflict messages", () => {
  it.each([
    ["FORM_TEMPLATE_RECONCILIATION_REQUIRED", "template selection"],
    ["FORM_CATEGORY_RECONCILIATION_REQUIRED", "category selection"],
    ["FORM_DOCUMENT_RECONCILIATION_REQUIRED", "form editor"],
    ["MANAGED_ASSET_NOT_SCAN_READY", "safety scan"],
    ["MANAGED_FORM_ASSET_TYPE_INVALID", "PNG, JPEG, WebP or GIF"],
  ])("shows safe guidance for %s", (code, guidance) => {
    const message = getErrorMessage({ detail: { code, internal_metadata: "must-not-be-rendered" } });
    expect(message).toContain(guidance);
    expect(message).not.toContain(code);
    expect(message).not.toContain("must-not-be-rendered");
  });
  it("does not treat object-prototype keys as message mappings", () => {
    expect(getErrorMessage({ code: "__proto__", message: "Existing safe message" })).toBe("Existing safe message");
  });
  it("preserves existing error and validation messages", () => {
    expect(getErrorMessage({ detail: { message: "Please reload" } })).toBe("Please reload");
    expect(getErrorMessage([{ msg: "Required", loc: ["body", "name"] }])).toBe("name: Required");
  });
});
