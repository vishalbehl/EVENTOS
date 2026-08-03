import { describe, expect, it } from "vitest";

import { isManagedIconAsset, renderEmailDocument } from "./studio";
import type { EmailDocument } from "./types";

const root = (childrenIds: string[]): EmailDocument =>
  ({
    root: {
      type: "EmailLayout",
      data: {
        backdropColor: "#f0f1f3",
        canvasColor: "#ffffff",
        textColor: "#202124",
        fontFamily: "MODERN_SANS",
        childrenIds,
      },
    },
  }) as EmailDocument;

describe("schema-v4 rendering parity", () => {
  it("applies editable icon sizing, padding, border, alignment and link settings", () => {
    const document = root(["icon"]);
    document.icon = {
      type: "Image",
      data: {
        editorRole: "STANDALONE_ICON",
        editorSchemaVersion: 4,
        editorMetadata: { accessibilityLabel: "Calendar", iconColor: "#7c3aed" },
        style: {
          textAlign: "center",
          padding: { top: 8, right: 9, bottom: 10, left: 11 },
          borderStyle: "solid",
          borderWidth: 2,
          borderColor: "#7c3aed",
          borderRadius: 12,
        },
        props: {
          url: "https://cdn.example.test/calendar.png",
          alt: "Calendar",
          width: 64,
          linkHref: "https://example.test/calendar",
        },
      },
    };

    const html = renderEmailDocument(document);
    expect(html).toContain("padding:8px 9px 10px 11px");
    expect(html).toContain("text-align:center");
    expect(html).toContain("width:64px");
    expect(html).toContain("border:2px solid #7c3aed");
    expect(html).toContain("border-radius:12px");
    expect(html).toContain('href="https://example.test/calendar"');
  });

  it("applies button and divider property changes to generated email HTML", () => {
    const document = root(["button", "divider"]);
    document.button = {
      type: "Button",
      data: {
        style: {
          textAlign: "right",
          fontSize: 18,
          padding: { top: 4, right: 5, bottom: 6, left: 7 },
        },
        props: {
          text: "Register",
          url: "https://example.test/register",
          buttonBackgroundColor: "#0f766e",
          buttonTextColor: "#ffffff",
          buttonStyle: "pill",
          fullWidth: true,
        },
      },
    };
    document.divider = {
      type: "Divider",
      data: {
        style: { padding: { top: 3, right: 0, bottom: 3, left: 0 } },
        props: { lineStyle: "dashed", lineHeight: 4, lineColor: "#ef4444" },
      },
    };

    const html = renderEmailDocument(document);
    expect(html).toContain("background:#0f766e");
    expect(html).toContain("border-radius:999px");
    expect(html).toContain("width:100%");
    expect(html).toContain("border-top:4px dashed #ef4444");
  });
});

describe("managed media classification", () => {
  it("keeps icons out of the image library, including legacy Lucide uploads", () => {
    expect(
      isManagedIconAsset({
        id: "current-icon",
        name: "Custom mark.png",
        url: "https://cdn.example.test/custom.png",
        fileType: "image/png",
        scopeType: "PLATFORM",
        assetKind: "ICON",
      }),
    ).toBe(true);
    expect(
      isManagedIconAsset({
        id: "legacy-icon",
        name: "linkedin.png",
        url: "https://cdn.example.test/linkedin.png",
        fileType: "image/png",
        scopeType: "PLATFORM",
        assetKind: "IMAGE",
      }),
    ).toBe(true);
    expect(
      isManagedIconAsset({
        id: "photo",
        name: "conference-stage.png",
        url: "https://cdn.example.test/stage.png",
        fileType: "image/png",
        scopeType: "PLATFORM",
        assetKind: "IMAGE",
      }),
    ).toBe(false);
  });
});
