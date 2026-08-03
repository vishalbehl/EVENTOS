import { describe, expect, it } from "vitest";

import { CATALOGUE, createCatalogueFragment } from "./catalogue";
import { capabilityFor, editorRoleOf } from "./capabilities";

describe("schema-v4 component capabilities", () => {
  it.each(CATALOGUE.map((item) => [item.key, item.label]))(
    "%s (%s) resolves a complete property contract",
    (key) => {
      const fragment = createCatalogueFragment(key);
      for (const node of Object.values(fragment.nodes)) {
        const capability = capabilityFor(node);
        expect(capability.label).toBeTruthy();
        expect(capability.sections).toContain("spacing");
        expect(capability.sections).toContain("responsive");
        expect(capability.sections).toContain("accessibility");
        expect(capability.sections).toContain("advanced");
      }
    },
  );

  it("exposes one social catalogue component with individually editable icons", () => {
    expect(CATALOGUE.filter((item) => item.key === "social")).toHaveLength(1);
    expect(
      CATALOGUE.some(
        (item) => item.key === "social-icon" || item.key === "icons",
      ),
    ).toBe(false);
    const fragment = createCatalogueFragment("social");
    expect(editorRoleOf(fragment.nodes[fragment.rootIds[0]])).toBe(
      "SOCIAL_GROUP",
    );
    expect(
      Object.values(fragment.nodes).filter(
        (node) => editorRoleOf(node) === "SOCIAL_ICON",
      ),
    ).toHaveLength(3);
  });

  it("uses managed, editable list and table metadata", () => {
    const list = createCatalogueFragment("list");
    const table = createCatalogueFragment("table");
    expect(editorRoleOf(list.nodes[list.rootIds[0]])).toBe("MANAGED_LIST");
    expect(editorRoleOf(table.nodes[table.rootIds[0]])).toBe("MANAGED_TABLE");
    expect(list.nodes[list.rootIds[0]].data.editorMetadata).toMatchObject({
      items: expect.any(Array),
    });
    expect(table.nodes[table.rootIds[0]].data.editorMetadata).toMatchObject({
      table: { rows: expect.any(Array) },
    });
  });

  it("treats inserted library icons as editable media nodes", () => {
    const capability = capabilityFor({
      type: "Image",
      data: { editorRole: "STANDALONE_ICON", editorSchemaVersion: 4 },
    });
    expect(capability.label).toBe("Icon");
    expect(capability.media).toBe("icon");
    expect(capability.supportsAction).toBe(true);
    expect(capability.sections).toContain("spacing");
  });
});
