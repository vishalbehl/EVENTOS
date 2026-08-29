import type { StudioNode } from "./document";

export type CatalogueItem = {
  key: string;
  label: string;
  group: "Basic" | "Event components" | "Content" | "Sections";
  icon: string;
  premium?: boolean;
};
export type FragmentDefinition = {
  nodes: Record<string, StudioNode>;
  rootIds: string[];
};

export const CATALOGUE: CatalogueItem[] = [
  { key: "text", label: "Text", group: "Basic", icon: "text" },
  { key: "heading", label: "Heading", group: "Basic", icon: "heading" },
  { key: "image", label: "Image", group: "Basic", icon: "image" },
  { key: "icon", label: "Icon", group: "Basic", icon: "sticker" },
  { key: "button", label: "Button", group: "Basic", icon: "button" },
  { key: "divider", label: "Divider", group: "Basic", icon: "divider" },
  { key: "spacer", label: "Spacer", group: "Basic", icon: "spacer" },
  {
    key: "social",
    label: "Social icons",
    group: "Basic",
    icon: "social",
    premium: true,
  },
  { key: "html", label: "HTML", group: "Basic", icon: "html" },
  { key: "menu", label: "Link menu", group: "Basic", icon: "menu" },
  { key: "list", label: "List", group: "Basic", icon: "list" },
  { key: "table", label: "Table", group: "Basic", icon: "table" },
  { key: "video", label: "Video", group: "Basic", icon: "video" },
  { key: "gif", label: "GIF", group: "Basic", icon: "gif" },
  { key: "sticker", label: "Sticker", group: "Basic", icon: "sticker" },
  { key: "avatar", label: "Avatar", group: "Basic", icon: "avatar" },

  {
    key: "event-header",
    label: "Event header",
    group: "Event components",
    icon: "event-header",
    premium: true,
  },
  {
    key: "speakers",
    label: "Speakers",
    group: "Event components",
    icon: "speakers",
    premium: true,
  },
  {
    key: "agenda",
    label: "Agenda",
    group: "Event components",
    icon: "agenda",
    premium: true,
  },
  { key: "venue", label: "Venue", group: "Event components", icon: "venue" },
  {
    key: "countdown",
    label: "Countdown",
    group: "Event components",
    icon: "countdown",
  },
  {
    key: "sponsors",
    label: "Sponsors",
    group: "Event components",
    icon: "sponsors",
  },
  {
    key: "qr-badge",
    label: "QR badge",
    group: "Event components",
    icon: "qr-badge",
  },
  {
    key: "register-cta",
    label: "Register CTA",
    group: "Event components",
    icon: "register-cta",
  },
  {
    key: "certificate",
    label: "Certificate",
    group: "Event components",
    icon: "certificate",
  },

  { key: "columns", label: "Columns", group: "Content", icon: "columns" },
  {
    key: "image-text",
    label: "Image + text",
    group: "Content",
    icon: "image-text",
  },
  {
    key: "text-image",
    label: "Text + image",
    group: "Content",
    icon: "text-image",
  },
  {
    key: "image-group",
    label: "Image group",
    group: "Content",
    icon: "image-group",
  },
  {
    key: "card",
    label: "Feature card",
    group: "Content",
    icon: "card",
    premium: true,
  },
  { key: "quote", label: "Quote", group: "Content", icon: "quote" },

  {
    key: "section-header",
    label: "Brand header",
    group: "Sections",
    icon: "section-header",
    premium: true,
  },
  {
    key: "section-hero",
    label: "Event hero",
    group: "Sections",
    icon: "section-hero",
    premium: true,
  },
  {
    key: "section-content",
    label: "Single column",
    group: "Sections",
    icon: "section-content",
  },
  {
    key: "section-two",
    label: "Two columns",
    group: "Sections",
    icon: "section-two",
  },
  {
    key: "section-three",
    label: "Three columns",
    group: "Sections",
    icon: "section-three",
  },
  {
    key: "section-split",
    label: "Split media",
    group: "Sections",
    icon: "section-split",
  },
  {
    key: "section-registration",
    label: "Registration",
    group: "Sections",
    icon: "section-registration",
  },
  {
    key: "section-stats",
    label: "Statistics",
    group: "Sections",
    icon: "section-stats",
  },
  {
    key: "section-cta",
    label: "Call to action",
    group: "Sections",
    icon: "section-cta",
  },
  {
    key: "section-social",
    label: "Social footer",
    group: "Sections",
    icon: "section-social",
    premium: true,
  },
  {
    key: "section-legal",
    label: "Legal footer",
    group: "Sections",
    icon: "section-legal",
  },
  {
    key: "eventos-branding",
    label: "EventOS footer",
    group: "Sections",
    icon: "section-legal",
  },
];

const pad = (top = 14, right = 24, bottom = 14, left = 24) => ({
  top,
  right,
  bottom,
  left,
});
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const text = (
  value: string,
  style: Record<string, unknown> = {},
  markdown = false,
): StudioNode => ({
  type: "Text",
  data: {
    style: { padding: pad(), ...style },
    props: { text: value, markdown },
  },
});
const heading = (
  value: string,
  level: "h1" | "h2" | "h3" = "h2",
  style: Record<string, unknown> = {},
): StudioNode => ({
  type: "Heading",
  data: {
    style: { padding: pad(), fontWeight: "bold", ...style },
    props: { text: value, level },
  },
});
const image = (
  url = "https://placehold.co/600x280/png",
  alt = "Email image",
  width = 552,
  linkHref: string | null = null,
  style: Record<string, unknown> = {},
): StudioNode => ({
  type: "Image",
  data: {
    style: { padding: pad(), textAlign: "center", ...style },
    props: { url, alt, width, linkHref },
  },
});
const avatar = (url: string, alt: string): StudioNode => ({
  type: "Avatar",
  data: {
    style: { padding: pad(14, 12, 8, 12), textAlign: "center" },
    props: { imageUrl: url, alt, size: 84, shape: "circle" },
  },
});
const button = (
  label: string,
  url: string,
  background = "#4f46e5",
): StudioNode => ({
  type: "Button",
  data: {
    style: { padding: pad(), textAlign: "center", fontWeight: "bold" },
    props: {
      text: label,
      url,
      buttonStyle: "rounded",
      buttonBackgroundColor: background,
      buttonTextColor: "#ffffff",
      size: "medium",
      fullWidth: false,
    },
  },
});
const divider = (color = "#e7e9f2"): StudioNode => ({
  type: "Divider",
  data: {
    style: { padding: pad(8, 24, 8, 24) },
    props: { lineColor: color, lineHeight: 1 },
  },
});
const html = (
  contents: string,
  style: Record<string, unknown> = {},
): StudioNode => ({
  type: "Html",
  data: { style: { padding: pad(), ...style }, props: { contents } },
});

function linear(...nodes: StudioNode[]): FragmentDefinition {
  const record: Record<string, StudioNode> = {};
  const rootIds: string[] = [];
  nodes.forEach((node) => {
    const id = uid(node.type.toLowerCase());
    record[id] = node;
    rootIds.push(id);
  });
  return { nodes: record, rootIds };
}

function withRole(
  fragment: FragmentDefinition,
  role: string,
): FragmentDefinition {
  if (!fragment || !Array.isArray(fragment.rootIds)) {
    console.error("Invalid fragment passed to withRole:", fragment);
    return fragment;
  }
  for (const id of fragment.rootIds) {
    const node = fragment.nodes[id];
    node.data = { ...node.data, editorRole: role, editorSchemaVersion: 4 };
  }
  return fragment;
}

function withNodeRole(node: StudioNode, role: string): StudioNode {
  node.data = { ...node.data, editorRole: role, editorSchemaVersion: 4 };
  return node;
}

function merge(...fragments: FragmentDefinition[]): FragmentDefinition {
  return {
    nodes: Object.assign({}, ...fragments.map((fragment) => fragment.nodes)),
    rootIds: fragments.flatMap((fragment) => fragment.rootIds),
  };
}

function wrap(
  children: FragmentDefinition,
  style: Record<string, unknown> = {},
): FragmentDefinition {
  const id = uid("container");
  return {
    nodes: {
      ...children.nodes,
      [id]: {
        type: "Container",
        data: {
          style: {
            padding: pad(10, 10, 10, 10),
            backgroundColor: "#ffffff",
            borderColor: "#e7e9f2",
            borderRadius: 10,
            ...style,
          },
          props: { childrenIds: children.rootIds },
        },
      },
    },
    rootIds: [id],
  };
}

function container(
  children: StudioNode[],
  style: Record<string, unknown> = {},
): FragmentDefinition {
  return wrap(linear(...children), style);
}

function columnsFragments(
  left: FragmentDefinition,
  right: FragmentDefinition,
  third?: FragmentDefinition,
  options: {
    gap?: number;
    background?: string;
    padding?: ReturnType<typeof pad>;
    widths?: [number | null, number | null, number | null];
  } = {},
): FragmentDefinition {
  const empty = linear();
  const last = third ?? empty;
  const id = uid("columns");
  return {
    nodes: {
      ...left.nodes,
      ...right.nodes,
      ...last.nodes,
      [id]: {
        type: "ColumnsContainer",
        data: {
          style: {
            padding: options.padding ?? pad(),
            backgroundColor: options.background ?? "#ffffff",
          },
          props: {
            columns: [
              { childrenIds: left.rootIds },
              { childrenIds: right.rootIds },
              { childrenIds: last.rootIds },
            ],
            columnsCount: third ? 3 : 2,
            columnsGap: options.gap ?? 16,
            contentAlignment: "middle",
            fixedWidths: options.widths ?? [null, null, null],
          },
        },
      },
    },
    rootIds: [id],
  };
}

function columns(
  left: StudioNode[],
  right: StudioNode[],
  third?: StudioNode[],
  options?: Parameters<typeof columnsFragments>[3],
): FragmentDefinition {
  return columnsFragments(
    linear(...left),
    linear(...right),
    third ? linear(...third) : undefined,
    options,
  );
}

const socialIcon = (network: string) => {
  const variable =
    network === "linkedin"
      ? "LinkedInUrl"
      : `${network[0].toUpperCase()}${network.slice(1)}Url`;
  const node = image(
    `https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/${network}.svg`,
    `${network} icon`,
    28,
    `{{${variable}}}`,
    { padding: pad(10, 12, 10, 12) },
  );
  node.data = {
    ...node.data,
    editorRole: "SOCIAL_ICON",
    editorSchemaVersion: 4,
    editorMetadata: {
      network,
      action: { type: "WEB", href: `{{${variable}}}` },
      accessibilityLabel: `${network} profile`,
    },
  };
  return node;
};

function socialRow(dark = false): FragmentDefinition {
  return withRole(
    columns(
      [socialIcon("facebook")],
      [socialIcon("linkedin")],
      [socialIcon("instagram")],
      {
        gap: 4,
        background: dark ? "#111827" : "#ffffff",
        padding: pad(4, 170, 4, 170),
      },
    ),
    "SOCIAL_GROUP",
  );
}

function eventHeader(): FragmentDefinition {
  const copy = merge(
    linear(
      text("EVENTOS CONFERENCE", {
        color: "#a5b4fc",
        fontSize: 12,
        fontWeight: "bold",
        padding: pad(8, 26, 4, 26),
      }),
    ),
    linear(
      heading("{{EventName}}", "h1", {
        color: "#ffffff",
        padding: pad(8, 26, 10, 26),
      }),
    ),
    linear(
      text("{{EventDate}}\n{{EventVenue}}", {
        color: "#dbe4ff",
        padding: pad(4, 26, 20, 26),
      }),
    ),
  );
  const artwork = linear(
    image(
      "https://placehold.co/360x260/312e81/ffffff/png?text=EVENT+HERO",
      "Event hero",
      252,
      null,
      { padding: pad(18, 22, 18, 8) },
    ),
  );
  return columnsFragments(copy, artwork, undefined, {
    gap: 0,
    background: "#111827",
    padding: pad(16, 10, 16, 10),
    widths: [330, 250, null],
  });
}

function speakerCard(
  name: string,
  title: string,
  initials: string,
): FragmentDefinition {
  return wrap(
    linear(
      avatar(
        `https://placehold.co/168x168/ede9fe/4f46e5/png?text=${initials}`,
        `${name} portrait`,
      ),
      heading(name, "h3", { textAlign: "center", padding: pad(6, 10, 2, 10) }),
      text(title, {
        color: "#667085",
        fontSize: 13,
        textAlign: "center",
        padding: pad(2, 10, 14, 10),
      }),
    ),
    {
      backgroundColor: "#f8f7ff",
      borderColor: "#e7e3ff",
      borderRadius: 14,
      padding: pad(8, 8, 8, 8),
    },
  );
}

function agendaItem(
  time: string,
  title: string,
  room: string,
): FragmentDefinition {
  return columnsFragments(
    linear(
      heading(time, "h3", {
        color: "#4f46e5",
        padding: pad(14, 10, 14, 10),
        textAlign: "center",
      }),
    ),
    merge(
      linear(heading(title, "h3", { padding: pad(10, 12, 2, 12) })),
      linear(
        text(room, {
          color: "#667085",
          fontSize: 13,
          padding: pad(2, 12, 10, 12),
        }),
      ),
    ),
    undefined,
    {
      gap: 6,
      background: "#f8fafc",
      padding: pad(2, 6, 2, 6),
      widths: [110, 430, null],
    },
  );
}

export function createCatalogueFragment(key: string): FragmentDefinition {
  if (key === "text")
    return linear(text("Write the next part of your message."));
  if (key === "heading") return linear(heading("A clear message headline"));
  if (key === "image") return linear(image());
  if (key === "icon")
    return withRole(
      linear(
        image(
          "https://placehold.co/48x48/f3f4f6/9ca3af/png?text=ICON",
          "Icon",
          48,
        ),
      ),
      "SOCIAL_ICON",
    );
  if (key === "button")
    return linear(button("Continue", "{{RegistrationUrl}}"));
  if (key === "divider") return linear(divider());
  if (key === "spacer")
    return linear({ type: "Spacer", data: { props: { height: 28 } } });
  if (key === "social") return socialRow();
  if (key === "html") return linear(html("<p>Custom email-safe HTML</p>"));
  if (key === "menu")
    return withRole(
      columns(
        [
          withNodeRole(
            text(
              "[Event]({{EventWebsiteUrl}})",
              { textAlign: "center", color: "#4f46e5" },
              true,
            ),
            "MENU_ITEM",
          ),
        ],
        [
          withNodeRole(
            text(
              "[Agenda]({{AgendaUrl}})",
              { textAlign: "center", color: "#4f46e5" },
              true,
            ),
            "MENU_ITEM",
          ),
        ],
        [
          withNodeRole(
            text(
              "[Support]({{SupportUrl}})",
              { textAlign: "center", color: "#4f46e5" },
              true,
            ),
            "MENU_ITEM",
          ),
        ],
        { gap: 0, padding: pad(6, 80, 6, 80) },
      ),
      "MENU_GROUP",
    );
  if (key === "list") {
    const fragment = withRole(
      linear(
        text("First useful point\nSecond useful point\nThird useful point"),
      ),
      "MANAGED_LIST",
    );
    fragment.nodes[fragment.rootIds[0]].data.editorMetadata = {
      listType: "unordered",
      marker: "disc",
      start: 1,
      itemSpacing: 8,
      indent: 24,
      items: [
        "First useful point",
        "Second useful point",
        "Third useful point",
      ],
    };
    return fragment;
  }
  if (key === "eventos-branding") {
    return columns(
      [
        withNodeRole(
          image(
            "data:image/png;base64,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",
            "EventOS",
            48,
            null,
            { padding: pad(12, 1, 12, 1), textAlign: "center" }
          ),
          "BRAND_LOGO"
        )
      ],
      [
        withNodeRole(
          text(
            "In collaboration with EventOS",
            { color: "#667085", fontSize: 13, padding: pad(25, 0, 12, 12), textAlign: "left" },
            false
          ),
          "BRAND_TEXT"
        )
      ],
      undefined,
      { gap: 0, padding: pad(0, 0, 0, 0), widths: [64, null, null] }
    );
  }
  if (key === "table") {
    const fragment = withRole(
      container(
        [
          heading("Schedule", "h3"),
          divider(),
          text("Time                 Session                 Room", {
            fontFamily: "MONOSPACE",
            fontWeight: "bold",
          }),
          text("09:00               Opening keynote      Main hall", {
            fontFamily: "MONOSPACE",
          }),
          text("11:30               Product workshop     Studio A", {
            fontFamily: "MONOSPACE",
          }),
        ],
        { borderColor: "#dfe3eb", borderRadius: 10 },
      ),
      "MANAGED_TABLE",
    );
    fragment.nodes[fragment.rootIds[0]].data.editorMetadata = {
      table: {
        headerRow: true,
        striped: false,
        columns: 3,
        rows: [
          ["Time", "Session", "Room"],
          ["09:00", "Opening keynote", "Main hall"],
          ["11:30", "Product workshop", "Studio A"],
        ],
      },
    };
    return fragment;
  }
  if (key === "video")
    return withRole(
      linear(
        image(
          "https://placehold.co/600x320/111827/ffffff/png?text=%E2%96%B6+PLAY+VIDEO",
          "Video preview",
          552,
          "{{EventWebsiteUrl}}",
        ),
      ),
      "VIDEO",
    );
  if (key === "gif")
    return withRole(
      linear(
        image(
          "https://placehold.co/600x280/ede9fe/4f46e5/gif?text=Animated+GIF",
          "Animated GIF",
          552,
        ),
      ),
      "GIF",
    );
  if (key === "sticker")
    return withRole(
      linear(
        image(
          "https://placehold.co/180x180/ffffff/4f46e5/png?text=%E2%98%85",
          "Decorative sticker",
          180,
        ),
      ),
      "STICKER",
    );
  if (key === "avatar")
    return withRole(
      linear(
        avatar(
          "https://placehold.co/160x160/e7e9f2/4f46e5/png?text=AV",
          "Profile portrait",
        ),
      ),
      "AVATAR",
    );

  if (key === "event-header") return eventHeader();
  if (key === "speakers")
    return wrap(
      merge(
        linear(
          heading("Featured speakers", "h2", { padding: pad(18, 18, 12, 18) }),
        ),
        columnsFragments(
          speakerCard("Sarah Chen", "Quantum systems researcher", "SC"),
          speakerCard("Omar Rahman", "Product and AI leader", "OR"),
          undefined,
          { gap: 12, padding: pad(0, 10, 12, 10) },
        ),
      ),
      { borderColor: "#e7e9f2", borderRadius: 14, padding: pad(6, 6, 6, 6) },
    );
  if (key === "agenda")
    return wrap(
      merge(
        linear(
          heading("Programme highlights", "h2", {
            padding: pad(18, 18, 10, 18),
          }),
        ),
        agendaItem("09:00", "Opening keynote", "Grand Ballroom"),
        linear(divider("#dde2ee")),
        agendaItem("11:30", "Designing reliable event systems", "Hall A"),
      ),
      { borderColor: "#e7e9f2", borderRadius: 14, padding: pad(4, 8, 8, 8) },
    );
  if (key === "venue")
    return container(
      [
        heading("Meet us in Dubai", "h2"),
        text("{{EventVenue}}\n{{VenueAddress}}"),
        button("Open map", "{{VenueMapUrl}}"),
      ],
      { backgroundColor: "#f8f7ff", borderColor: "#e7e3ff", borderRadius: 14 },
    );
  if (key === "countdown")
    return container(
      [
        text("EVENT STARTS IN", {
          color: "#667085",
          fontSize: 12,
          textAlign: "center",
        }),
        heading("{{DaysUntilEvent}} days", "h1", {
          textAlign: "center",
          color: "#4f46e5",
        }),
        text("{{EventDate}}", { textAlign: "center" }),
      ],
      { backgroundColor: "#f8f7ff", borderColor: "#e7e3ff", borderRadius: 14 },
    );
  if (key === "sponsors")
    return wrap(
      merge(
        linear(heading("With support from", "h2", { textAlign: "center" })),
        columns(
          [
            image(
              "https://placehold.co/220x90/ffffff/111827/png?text=NORTHSTAR",
              "Northstar logo",
              150,
            ),
          ],
          [
            image(
              "https://placehold.co/220x90/ffffff/111827/png?text=ORBIT",
              "Orbit logo",
              150,
            ),
          ],
          [
            image(
              "https://placehold.co/220x90/ffffff/111827/png?text=VERTEX",
              "Vertex logo",
              150,
            ),
          ],
          { gap: 12, padding: pad(4, 20, 16, 20) },
        ),
      ),
      { borderColor: "#e7e9f2", borderRadius: 14 },
    );
  if (key === "qr-badge")
    return columns(
      [image("{{QrBadgeUrl}}", "Registration QR code", 180)],
      [
        heading("Your event badge", "h2"),
        text(
          "Present this code at check-in.\nRegistration: {{RegistrationId}}",
        ),
      ],
      undefined,
      {
        background: "#f8fafc",
        padding: pad(16, 20, 16, 20),
        widths: [210, 330, null],
      },
    );
  if (key === "register-cta")
    return container(
      [
        heading("Complete your registration", "h2", { textAlign: "center" }),
        text("Confirm your details before the deadline.", {
          textAlign: "center",
          color: "#667085",
        }),
        button("View my registration", "{{RegistrationUrl}}"),
      ],
      { backgroundColor: "#f0efff", borderColor: "#ddd8ff", borderRadius: 16 },
    );
  if (key === "certificate")
    return columns(
      [
        image(
          "https://placehold.co/240x180/ede9fe/4f46e5/png?text=CERTIFICATE",
          "Certificate preview",
          210,
        ),
      ],
      [
        heading("Your certificate is ready", "h2"),
        text("Download and keep your certificate of participation."),
        button("Download certificate", "{{CertificateUrl}}"),
      ],
      undefined,
      { background: "#fafaff", padding: pad(14, 16, 14, 16) },
    );

  if (key === "columns" || key === "section-two")
    return columns(
      [heading("First column", "h3"), text("Add content here.")],
      [heading("Second column", "h3"), text("Add content here.")],
    );
  if (key === "section-three")
    return columns(
      [heading("One", "h3"), text("Detail")],
      [heading("Two", "h3"), text("Detail")],
      [heading("Three", "h3"), text("Detail")],
    );
  if (key === "image-text" || key === "section-split")
    return columns(
      [
        image(
          "https://placehold.co/260x220/e7e9f2/4f46e5/png?text=IMAGE",
          "Section image",
          250,
        ),
      ],
      [
        heading("Tell the story", "h2"),
        text("Pair a strong image with concise supporting copy."),
        button("Learn more", "{{EventWebsiteUrl}}"),
      ],
      undefined,
      { gap: 18 },
    );
  if (key === "text-image")
    return columns(
      [
        heading("Tell the story", "h2"),
        text("Pair concise supporting copy with a strong image."),
        button("Learn more", "{{EventWebsiteUrl}}"),
      ],
      [
        image(
          "https://placehold.co/260x220/e7e9f2/4f46e5/png?text=IMAGE",
          "Section image",
          250,
        ),
      ],
    );
  if (key === "image-group")
    return columns(
      [
        image(
          "https://placehold.co/170x140/e7e9f2/4f46e5/png?text=01",
          "Gallery image",
          165,
        ),
      ],
      [
        image(
          "https://placehold.co/170x140/e7e9f2/4f46e5/png?text=02",
          "Gallery image",
          165,
        ),
      ],
      [
        image(
          "https://placehold.co/170x140/e7e9f2/4f46e5/png?text=03",
          "Gallery image",
          165,
        ),
      ],
    );
  if (key === "card")
    return container(
      [
        text("FEATURED", {
          color: "#4f46e5",
          fontSize: 11,
          fontWeight: "bold",
        }),
        heading("A polished content card", "h2"),
        text(
          "Group a focused message, supporting detail, and one clear next step.",
          { color: "#667085" },
        ),
        button("Learn more", "{{EventWebsiteUrl}}"),
      ],
      {
        backgroundColor: "#f8f7ff",
        borderColor: "#ded9ff",
        borderRadius: 16,
        padding: pad(14, 14, 14, 14),
      },
    );
  if (key === "quote")
    return container(
      [
        heading("“A memorable event starts with a clear invitation.”", "h2", {
          textAlign: "center",
        }),
        text("— Event team", { textAlign: "center", color: "#667085" }),
      ],
      { backgroundColor: "#f8fafc", borderColor: "#e7e9f2", borderRadius: 14 },
    );

  if (key === "section-header")
    return columnsFragments(
      merge(
        linear(
          image(
            "https://placehold.co/104x36/111827/ffffff/png?text=EVENTOS",
            "Eventos logo",
            104,
            "{{EventWebsiteUrl}}",
            { padding: pad(12, 8, 12, 18) },
          ),
        ),
        linear(
          text("CONFERENCE 2026", {
            color: "#667085",
            fontSize: 10,
            padding: pad(2, 18, 10, 18),
          }),
        ),
      ),
      linear(button("View event", "{{EventWebsiteUrl}}", "#111827")),
      undefined,
      { gap: 12, padding: pad(8, 12, 8, 12), widths: [380, 160, null] },
    );
  if (key === "section-hero")
    return merge(
      eventHeader(),
      linear(button("View event details", "{{EventWebsiteUrl}}")),
    );
  if (key === "section-content")
    return container(
      [
        heading("Section heading", "h2"),
        text("Build a focused section with a clear message and one next step."),
      ],
      { borderColor: "#eef0f5", borderRadius: 12 },
    );
  if (key === "section-registration")
    return container(
      [
        heading("Your registration details", "h2"),
        divider(),
        text(
          "Registration ID: {{RegistrationId}}\nTicket: {{TicketName}}\nAmount paid: {{AmountPaid}}",
        ),
        button("View my registration", "{{RegistrationUrl}}"),
      ],
      { backgroundColor: "#f8fafc", borderColor: "#e7e9f2", borderRadius: 14 },
    );
  if (key === "section-stats")
    return columns(
      [
        heading("{{EventDays}} days", "h3", { textAlign: "center" }),
        text("Programme", { textAlign: "center", color: "#667085" }),
      ],
      [
        heading("{{SpeakerCount}}+", "h3", { textAlign: "center" }),
        text("Speakers", { textAlign: "center", color: "#667085" }),
      ],
      [
        heading("{{SessionCount}}", "h3", { textAlign: "center" }),
        text("Sessions", { textAlign: "center", color: "#667085" }),
      ],
      { gap: 2, background: "#f8f7ff", padding: pad(12, 18, 12, 18) },
    );
  if (key === "section-cta")
    return container(
      [
        heading("Ready for the next step?", "h2", { textAlign: "center" }),
        text("Everything you need is one click away.", {
          textAlign: "center",
          color: "#667085",
        }),
        button("Continue", "{{RegistrationUrl}}"),
      ],
      { backgroundColor: "#eeecff", borderColor: "#dcd7ff", borderRadius: 16 },
    );
  if (key === "section-social")
    return wrap(
      merge(
        linear(
          image(
            "https://placehold.co/120x40/111827/ffffff/png?text=EVENTOS",
            "Eventos logo",
            120,
            "{{EventWebsiteUrl}}",
          ),
        ),
        linear(
          heading("Stay connected", "h2", {
            color: "#ffffff",
            textAlign: "center",
            padding: pad(10, 20, 2, 20),
          }),
        ),
        linear(
          text("Follow event updates and share your experience.", {
            color: "#cbd5e1",
            textAlign: "center",
            padding: pad(2, 20, 8, 20),
          }),
        ),
        socialRow(true),
        linear(divider("#374151")),
        linear(
          text(
            "{{OrganizationAddress}}\n[Unsubscribe]({{UnsubscribeUrl}})",
            {
              color: "#94a3b8",
              fontSize: 12,
              textAlign: "center",
              padding: pad(8, 20, 16, 20),
            },
            true,
          ),
        ),
      ),
      {
        backgroundColor: "#111827",
        borderColor: "#111827",
        borderRadius: 0,
        padding: pad(18, 12, 8, 12),
      },
    );
  if (key === "section-legal")
    return container(
      [
        text(
          "You received this email because you registered for {{EventName}}.\n{{OrganizationAddress}}\n[Unsubscribe]({{UnsubscribeUrl}})",
          { color: "#667085", fontSize: 12, textAlign: "center" },
          true,
        ),
      ],
      { backgroundColor: "#f8fafc", borderColor: "#eef0f5", borderRadius: 0 },
    );
  return linear(text("New content"));
}
