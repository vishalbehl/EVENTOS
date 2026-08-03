import type { StudioNode } from "./document";

export type PropertySection =
  | "content"
  | "typography"
  | "action"
  | "layout"
  | "spacing"
  | "border"
  | "background"
  | "responsive"
  | "accessibility"
  | "advanced";

export type ComponentCapability = {
  kind: "content" | "structure" | "document";
  label: string;
  sections: PropertySection[];
  directEdit?: boolean;
  collection?: "list" | "table" | "social" | "menu";
  media?: "image" | "icon" | "video";
  supportsTypography?: boolean;
  supportsAction?: boolean;
  supportsBorder?: boolean;
  supportsBackground?: boolean;
  supportsWidth?: boolean;
};

const COMMON: PropertySection[] = [
  "layout",
  "spacing",
  "border",
  "background",
  "responsive",
  "accessibility",
  "advanced",
];
const CONTENT = (extra: PropertySection[] = []): PropertySection[] => [
  "content",
  ...extra,
  ...COMMON,
];

const byType: Record<string, ComponentCapability> = {
  EmailLayout: {
    kind: "document",
    label: "Email",
    sections: [
      "content",
      "typography",
      "layout",
      "background",
      "accessibility",
      "advanced",
    ],
    supportsTypography: true,
    supportsBackground: true,
    supportsWidth: true,
  },
  Text: {
    kind: "content",
    label: "Paragraph",
    sections: CONTENT(["typography", "action"]),
    directEdit: true,
    supportsTypography: true,
    supportsAction: true,
    supportsBorder: true,
    supportsBackground: true,
    supportsWidth: true,
  },
  Heading: {
    kind: "content",
    label: "Heading",
    sections: CONTENT(["typography", "action"]),
    directEdit: true,
    supportsTypography: true,
    supportsAction: true,
    supportsBorder: true,
    supportsBackground: true,
    supportsWidth: true,
  },
  Image: {
    kind: "content",
    label: "Image",
    sections: CONTENT(["action"]),
    media: "image",
    supportsAction: true,
    supportsBorder: true,
    supportsBackground: true,
    supportsWidth: true,
  },
  Avatar: {
    kind: "content",
    label: "Avatar",
    sections: CONTENT(["action"]),
    media: "image",
    supportsAction: true,
    supportsBorder: true,
    supportsBackground: true,
    supportsWidth: true,
  },
  Button: {
    kind: "content",
    label: "Button",
    sections: CONTENT(["typography", "action"]),
    directEdit: true,
    supportsTypography: true,
    supportsAction: true,
    supportsBorder: true,
    supportsBackground: true,
    supportsWidth: true,
  },
  Divider: {
    kind: "content",
    label: "Divider",
    sections: CONTENT(),
    supportsBackground: true,
    supportsWidth: true,
  },
  Spacer: {
    kind: "content",
    label: "Spacer",
    sections: [
      "content",
      "spacing",
      "background",
      "responsive",
      "accessibility",
      "advanced",
    ],
    supportsBackground: true,
  },
  Html: {
    kind: "content",
    label: "HTML",
    sections: [
      "content",
      "spacing",
      "background",
      "responsive",
      "accessibility",
      "advanced",
    ],
    supportsBackground: true,
  },
  Container: {
    kind: "structure",
    label: "Row",
    sections: COMMON,
    supportsBorder: true,
    supportsBackground: true,
    supportsWidth: true,
  },
  ColumnsContainer: {
    kind: "structure",
    label: "Columns",
    sections: ["content", ...COMMON],
    supportsBorder: true,
    supportsBackground: true,
    supportsWidth: true,
  },
};

const roleOverrides: Record<string, Partial<ComponentCapability>> = {
  SOCIAL_GROUP: {
    kind: "content",
    label: "Social icons",
    collection: "social",
    sections: CONTENT(),
  },
  SOCIAL_ICON: {
    kind: "content",
    label: "Social icon",
    media: "icon",
    supportsAction: true,
    sections: CONTENT(["action"]),
  },
  STANDALONE_ICON: {
    kind: "content",
    label: "Icon",
    media: "icon",
    supportsAction: true,
    supportsBorder: true,
    supportsBackground: true,
    supportsWidth: true,
    sections: CONTENT(["action"]),
  },
  MENU_GROUP: {
    kind: "content",
    label: "Menu",
    collection: "menu",
    sections: CONTENT(["typography"]),
  },
  MENU_ITEM: {
    kind: "content",
    label: "Menu item",
    directEdit: true,
    supportsAction: true,
    supportsTypography: true,
    sections: CONTENT(["typography", "action"]),
  },
  MANAGED_LIST: {
    kind: "content",
    label: "List",
    collection: "list",
    directEdit: true,
    supportsTypography: true,
    sections: CONTENT(["typography", "action"]),
  },
  LIST: {
    kind: "content",
    label: "List",
    collection: "list",
    directEdit: true,
    supportsTypography: true,
    sections: CONTENT(["typography", "action"]),
  },
  MANAGED_TABLE: {
    kind: "content",
    label: "Table",
    collection: "table",
    directEdit: true,
    supportsTypography: true,
    sections: CONTENT(["typography"]),
  },
  TABLE: {
    kind: "content",
    label: "Table",
    collection: "table",
    directEdit: true,
    supportsTypography: true,
    sections: CONTENT(["typography"]),
  },
  VIDEO: {
    kind: "content",
    label: "Video",
    media: "video",
    supportsAction: true,
    sections: CONTENT(["action"]),
  },
  GIF: {
    kind: "content",
    label: "GIF",
    media: "image",
    supportsAction: true,
    sections: CONTENT(["action"]),
  },
  STICKER: {
    kind: "content",
    label: "Sticker",
    media: "image",
    supportsAction: true,
    sections: CONTENT(["action"]),
  },
  AVATAR: {
    kind: "content",
    label: "Avatar",
    media: "image",
    supportsAction: true,
    sections: CONTENT(["action"]),
  },
  QR_BADGE: {
    kind: "content",
    label: "QR badge",
    media: "image",
    supportsAction: true,
    sections: CONTENT(["action"]),
  },
  QUOTE: {
    kind: "content",
    label: "Quote",
    directEdit: true,
    supportsTypography: true,
    sections: CONTENT(["typography"]),
  },
  CARD: { kind: "structure", label: "Card", sections: ["content", ...COMMON] },
  IMAGE_GROUP: { kind: "content", label: "Image group", sections: CONTENT() },
};

export const editorRoleOf = (node: StudioNode | null | undefined) =>
  String(node?.data.editorRole ?? "").toUpperCase();

export function capabilityFor(
  node: StudioNode | null | undefined,
): ComponentCapability {
  if (!node) return byType.EmailLayout;
  const base = byType[node.type] ?? {
    kind: "content" as const,
    label: node.type,
    sections: CONTENT(),
    supportsBorder: true,
    supportsBackground: true,
    supportsWidth: true,
  };
  const override = roleOverrides[editorRoleOf(node)];
  return override ? { ...base, ...override } : base;
}

export const isStructuralNode = (node: StudioNode | null | undefined) =>
  capabilityFor(node).kind === "structure";
export const COMPONENT_CAPABILITIES = { byType, roleOverrides } as const;
