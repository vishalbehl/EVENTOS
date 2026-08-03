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
      container(
        [
          image(
            "https://placehold.co/600x320/111827/ffffff/png?text=%E2%96%B6+PLAY+VIDEO",
            "Video preview",
            552,
            "{{EventWebsiteUrl}}",
          ),
          text("Watch the event preview", {
            textAlign: "center",
            fontWeight: "bold",
          }),
        ],
        { backgroundColor: "#111827", borderRadius: 12 },
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
