import { renderToStaticMarkup, type TReaderDocument } from "@usewaypoint/email-builder";
import { describe, expect, it } from "vitest";

import { CATALOGUE, createCatalogueFragment } from "./catalogue";

describe("premium email catalogue", () => {
  it.each(CATALOGUE.map((item) => [item.key, item.label]))("renders %s (%s) as a valid Waypoint document", (key) => {
    const fragment = createCatalogueFragment(key);
    const document = {
      root: { type: "EmailLayout", data: { childrenIds: fragment.rootIds } },
      ...fragment.nodes,
    } as TReaderDocument;

    expect(() => renderToStaticMarkup(document, { rootBlockId: "root" })).not.toThrow();
  });

  it("uses native editable nodes for every composite catalogue item", () => {
    const nativeCompositeItems = CATALOGUE.filter((item) => item.key !== "html" && item.key !== "text" && item.key !== "heading" && item.key !== "image" && item.key !== "button" && item.key !== "divider" && item.key !== "spacer");
    for (const item of nativeCompositeItems) {
      const blockTypes = Object.values(createCatalogueFragment(item.key).nodes).map((node) => node.type);
      expect(blockTypes, item.key).not.toContain("Html");
    }
  });
});
