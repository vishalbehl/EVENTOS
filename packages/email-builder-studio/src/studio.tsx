"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  renderToStaticMarkup,
  type TReaderDocument,
} from "@usewaypoint/email-builder";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { SvgGallery } from "./undraw/SvgGallery";
import { generateYouTubeThumbnailWithPlayButton } from "./utils/generateVideoThumbnail";
import {
  Archive,
  ArrowLeft,
  Award,
  BadgeCheck,
  Blocks,
  Bold,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Code2,
  Columns3,
  Copy,
  Crop,
  Eye,
  FileStack,
  FlipHorizontal,
  FolderOpen,
  GalleryHorizontal,
  GalleryThumbnails,
  GripVertical,
  Heading1,
  Image as ImageIcon,
  Layers3,
  LayoutPanelLeft,
  LayoutTemplate,
  ListChecks,
  Italic,
  Link2,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  Minus,
  Monitor,
  MoreVertical,
  MousePointerClick,
  MoveVertical,
  Palette,
  Pencil,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Plus,
  QrCode,
  Quote,
  Redo2,
  RotateCw,
  Save,
  Search,
  Send,
  Shapes,
  Share2,
  Smartphone,
  Settings2,
  Sparkles,
  Star,
  Strikethrough,
  Timer,
  Trash2,
  Type,
  Underline,
  Undo2,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type CSSProperties,
} from "react";

import {
  CATALOGUE,
  createCatalogueFragment,
  type CatalogueItem,
  type FragmentDefinition,
} from "./catalogue";
import { capabilityFor, editorRoleOf, isStructuralNode } from "./capabilities";
import {
  ROOT_ID,
  allSlots,
  breadcrumb,
  cloneSubtree,
  descendants,
  nodeOf,
  parentSlot,
  removeSubtree,
  slotsOf,
  writeSlot,
  type ChildSlot,
  type StudioNode,
} from "./document";
import type {
  EmailBuilderStudioProps,
  EmailDocument,
  StudioAsset,
  StudioDraft,
  StudioTemplate,
  StudioVersion,
} from "./types";
import "./styles.css";

type SidebarTab = "content" | "rows" | "style";
type MediaTab = "library" | "upload" | "link" | "icons" | "svg";
type Tool =
  "components" | "templates" | "structure" | "assets" | "brand" | "document";
type InspectorTab = "content" | "style" | "settings";
type CatalogueTab = "blocks" | "sections" | "saved";
type SaveState = "saved" | "dirty" | "saving" | "error";
type DynamicIconName = keyof typeof dynamicIconImports;
const BRAND_ICONS: Array<[string, string, DynamicIconName]> = [
  ["facebook", "Facebook", "facebook"],
  ["instagram", "Instagram", "instagram"],
  ["linkedin", "LinkedIn", "linkedin"],
  ["x", "X", "twitter"],
  ["youtube", "YouTube", "youtube"],
  ["tiktok", "TikTok", "music-2"],
  ["whatsapp", "WhatsApp", "message-circle"],
  ["pinterest", "Pinterest", "pin"],
  ["snapchat", "Snapchat", "ghost"],
  ["discord", "Discord", "message-square"],
  ["telegram", "Telegram", "send"],
  ["reddit", "Reddit", "bot"],
  ["github", "GitHub", "github"],
  ["slack", "Slack", "slack"],
];
const ICON_CATEGORIES: Record<string, string[]> = {
  All: [],
  Events: [
    "calendar",
    "ticket",
    "badge",
    "award",
    "users",
    "map",
    "clock",
    "mic",
    "presentation",
  ],
  Communication: [
    "mail",
    "message",
    "phone",
    "send",
    "bell",
    "contact",
    "at-sign",
  ],
  Navigation: ["arrow", "chevron", "move", "navigation", "corner", "route"],
  Media: ["image", "video", "camera", "music", "play", "volume", "gallery"],
  Commerce: [
    "cart",
    "credit",
    "wallet",
    "dollar",
    "store",
    "package",
    "receipt",
  ],
  Shapes: [
    "circle",
    "square",
    "triangle",
    "star",
    "heart",
    "diamond",
    "hexagon",
  ],
};

export function isManagedIconAsset(asset: StudioAsset): boolean {
  if (asset.assetKind === "ICON") return true;
  if (["BUILTIN_ICON", "DERIVED"].includes(String(asset.sourceType ?? "")))
    return true;
  if (typeof asset.metadata?.iconName === "string") return true;

  // Older studio builds uploaded generated Lucide PNGs before the API accepted
  // asset_kind. Recognise those deterministic filenames so they are recovered
  // into Saved icons instead of polluting the image gallery.
  const basename = asset.name
    .toLowerCase()
    .replace(/\.(png|jpe?g|gif|webp)$/i, "");
  return (
    basename in dynamicIconImports ||
    /^icon-[0-9a-f]{6}$/i.test(basename) ||
    /^lucide-[a-z0-9-]+$/i.test(basename)
  );
}

function LibraryIcon({ name }: { name: DynamicIconName }) {
  const [Icon, setIcon] = useState<ComponentType<{
    size?: number;
    strokeWidth?: number;
  }> | null>(null);
  useEffect(() => {
    let current = true;
    void dynamicIconImports[name]().then((module) => {
      if (current) setIcon(() => module.default);
    });
    return () => {
      current = false;
    };
  }, [name]);
  return Icon ? (
    <Icon size={23} strokeWidth={1.8} />
  ) : (
    <span className="ebs-icon-skeleton" />
  );
}

const SAMPLE_VALUES: Record<string, string> = {
  EventName: "Eventos Conference 2026",
  ConferenceName: "EVENTOS",
  EventDate: "15–17 May 2026",
  EventVenue: "Grand Hyatt, Dubai, UAE",
  VenueAddress: "Riyadh Street, Dubai",
  DaysUntilEvent: "18",
  RegistrationId: "REG-2026-78421",
  TicketName: "Standard Pass",
  AmountPaid: "$299.00 USD",
  RegistrationUrl: "https://example.com/registration",
  EventWebsiteUrl: "https://example.com/event",
  AgendaUrl: "https://example.com/agenda",
  SupportUrl: "https://example.com/support",
  VenueMapUrl: "https://maps.example.com",
  QrBadgeUrl: "https://placehold.co/180x180/png?text=QR",
  CertificateUrl: "https://example.com/certificate",
  EventDays: "3",
  SpeakerCount: "100",
  SessionCount: "42",
  OrganizationAddress: "Eventos, Dubai, UAE",
  UnsubscribeUrl: "https://example.com/unsubscribe",
  FacebookUrl: "https://facebook.com",
  LinkedInUrl: "https://linkedin.com",
  InstagramUrl: "https://instagram.com",
  SpeakerName: "Sarah Chen",
  UploadLink: "https://example.com/upload",
};
const SAMPLE_COLLECTIONS: Record<string, Array<Record<string, string>>> = {
  Speakers: [
    {
      Name: "Sarah Chen",
      Title: "Quantum systems researcher",
      ImageUrl: "https://placehold.co/92x92/png?text=SC",
    },
    {
      Name: "Omar Rahman",
      Title: "Product and AI leader",
      ImageUrl: "https://placehold.co/92x92/png?text=OR",
    },
  ],
  AgendaItems: [
    { Time: "09:00", Title: "Opening keynote", Room: "Grand Ballroom" },
    {
      Time: "11:30",
      Title: "Designing reliable event systems",
      Room: "Hall A",
    },
  ],
  Sponsors: [
    {
      Name: "Northstar",
      LogoUrl: "https://placehold.co/220x80/png?text=Northstar",
    },
    { Name: "Orbit", LogoUrl: "https://placehold.co/220x80/png?text=Orbit" },
  ],
};

const CATALOGUE_ICONS: Record<string, LucideIcon> = {
  text: Type,
  heading: Heading1,
  image: ImageIcon,
  button: MousePointerClick,
  divider: Minus,
  spacer: MoveVertical,
  social: Share2,
  "social-icon": CircleUserRound,
  html: Code2,
  menu: Menu,
  list: ListChecks,
  table: LayoutTemplate,
  video: Eye,
  icons: Star,
  gif: ImageIcon,
  sticker: Sparkles,
  avatar: CircleUserRound,
  "event-header": Megaphone,
  speakers: Users,
  agenda: ListChecks,
  venue: MapPin,
  countdown: Timer,
  sponsors: Star,
  "qr-badge": QrCode,
  "register-cta": MousePointerClick,
  certificate: Award,
  columns: Columns3,
  "image-text": PanelLeft,
  "text-image": PanelRight,
  "image-group": GalleryThumbnails,
  card: PanelTop,
  quote: Quote,
  "section-header": PanelTop,
  "section-hero": GalleryHorizontal,
  "section-content": LayoutTemplate,
  "section-two": Columns3,
  "section-three": Columns3,
  "section-split": LayoutTemplate,
  "section-registration": BadgeCheck,
  "section-stats": Columns3,
  "section-cta": MousePointerClick,
  "section-social": Share2,
  "section-legal": PanelBottom,
};

export function createBlankEmailDocument(): EmailDocument {
  return {
    root: {
      type: "EmailLayout",
      data: {
        backdropColor: "#f0f1f3",
        canvasColor: "#ffffff",
        textColor: "#202124",
        fontFamily: "MODERN_SANS",
        childrenIds: [],
      },
    },
  } as EmailDocument;
}

function expandSampleData(value: string) {
  const repeated = value.replace(
    /\{\{#each\s+(Speakers|AgendaItems|Sponsors)\s+limit=(\d+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, collection: string, limit: string, body: string) => {
      const alias =
        collection === "AgendaItems" ? "AgendaItem" : collection.slice(0, -1);
      return (SAMPLE_COLLECTIONS[collection] ?? [])
        .slice(0, Number(limit))
        .map((item) =>
          body.replace(
            new RegExp(`\\{\\{${alias}\\.([A-Za-z]+)\\}\\}`, "g"),
            (_match: string, field: string) => item[field] ?? "",
          ),
        )
        .join("");
    },
  );
  return repeated.replace(
    /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g,
    (match, key) => SAMPLE_VALUES[key] ?? match,
  );
}

const escapeEmailText = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const paddingCss = (value: unknown, fallback = 0) => {
  const padding = (value as Record<string, number> | undefined) ?? {};
  return `${Number(padding.top ?? fallback)}px ${Number(padding.right ?? fallback)}px ${Number(padding.bottom ?? fallback)}px ${Number(padding.left ?? fallback)}px`;
};

function managedMarkup(node: StudioNode): string | null {
  const role = editorRoleOf(node);
  const metadata =
    (node.data.editorMetadata as Record<string, unknown> | undefined) ?? {};
  const style = (node.data.style ?? {}) as Record<string, unknown>;
  const props = (node.data.props ?? {}) as Record<string, unknown>;
  const blockBox = `background:${String(style.backgroundColor ?? "transparent")};padding:${paddingCss(style.padding)};text-align:${String(style.textAlign ?? "left")};direction:${String(style.direction ?? "ltr")}`;
  const border = `${Number(style.borderWidth ?? 0)}px ${String(style.borderStyle ?? "solid")} ${String(style.borderColor ?? "transparent")}`;
  if (node.type === "Text" || node.type === "Heading") {
    const tag =
      node.type === "Heading" && ["h1", "h2", "h3"].includes(String(props.level))
        ? String(props.level)
        : node.type === "Heading"
          ? "h2"
          : "div";
    const text = escapeEmailText(props.text ?? "").replaceAll("\n", "<br/>");
    return `<${tag} style="margin:0;${blockBox};color:${String(style.color ?? "#202124")};font-family:${String(style.fontFamily ?? "Arial,sans-serif")};font-size:${Number(style.fontSize ?? (node.type === "Heading" ? 24 : 16))}px;font-weight:${String(style.fontWeight ?? (node.type === "Heading" ? "bold" : "normal"))};font-style:${String(style.fontStyle ?? "normal")};text-decoration:${String(style.textDecoration ?? "none")};line-height:${Number(style.lineHeight ?? (node.type === "Heading" ? 1.18 : 1.5))};letter-spacing:${Number(style.letterSpacing ?? 0)}px;border:${border};border-radius:${Number(style.borderRadius ?? 0)}px">${text}</${tag}>`;
  }
  if (node.type === "Image") {
    const url = String(props.url ?? "");
    if (!url) return `<div style="${blockBox};color:#667085">Choose an image</div>`;
    const width = Math.max(1, Number(props.width ?? 552));
    const height = props.height ? `height:${Math.max(1, Number(props.height))}px;object-fit:cover;` : "height:auto;";
    const image = `<img src="${escapeEmailText(url)}" alt="${escapeEmailText(props.alt ?? metadata.accessibilityLabel ?? "")}" title="${escapeEmailText(props.title ?? "")}" width="${width}" style="display:inline-block;width:${width}px;max-width:100%;${height}border:${border};border-radius:${Number(style.borderRadius ?? 0)}px;outline:none;text-decoration:none;vertical-align:middle"/>`;
    const linked = props.linkHref
      ? `<a href="${escapeEmailText(props.linkHref)}" style="display:inline-block;text-decoration:none">${image}</a>`
      : image;
    return `<div style="${blockBox}">${linked}</div>`;
  }
  if (node.type === "Button") {
    const shape = String(props.buttonStyle ?? "rounded");
    const radius = shape === "pill" ? 999 : shape === "rectangle" ? 0 : 8;
    const fullWidth = props.fullWidth === true;
    return `<div style="${blockBox}"><a href="${escapeEmailText(props.url ?? "#")}" style="box-sizing:border-box;display:${fullWidth ? "block" : "inline-block"};width:${fullWidth ? "100%" : "auto"};padding:12px 20px;border-radius:${radius}px;background:${String(props.buttonBackgroundColor ?? "#2f58bf")};color:${String(props.buttonTextColor ?? "#ffffff")};font-family:${String(style.fontFamily ?? "Arial,sans-serif")};font-size:${Number(style.fontSize ?? 16)}px;font-weight:${String(style.fontWeight ?? "bold")};line-height:${Number(style.lineHeight ?? 1.25)};letter-spacing:${Number(style.letterSpacing ?? 0)}px;text-align:center;text-decoration:none">${escapeEmailText(props.text ?? "Button")}</a></div>`;
  }
  if (node.type === "Divider")
    return `<div style="${blockBox}"><div style="border-top:${Math.max(1, Number(props.lineHeight ?? 1))}px ${String(props.lineStyle ?? "solid")} ${String(props.lineColor ?? "#e7e9f2")};font-size:0;line-height:0">&nbsp;</div></div>`;
  if (node.type === "Spacer")
    return `<div aria-label="${escapeEmailText(metadata.accessibilityLabel ?? "Spacer")}" style="${blockBox};height:${Math.max(4, Number(props.height ?? 28))}px;font-size:0;line-height:0">&nbsp;</div>`;
  if (node.type === "Avatar") {
    const size = Math.max(24, Number(props.size ?? 64));
    const radius = props.shape === "circle" ? "50%" : props.shape === "rounded" ? "12px" : "0";
    return `<div style="${blockBox}"><img src="${escapeEmailText(props.imageUrl ?? "")}" alt="${escapeEmailText(props.alt ?? metadata.accessibilityLabel ?? "")}" width="${size}" height="${size}" style="display:inline-block;width:${size}px;height:${size}px;object-fit:cover;border:${border};border-radius:${radius};outline:none"/></div>`;
  }
  if (role === "MANAGED_LIST") {
    const items =
      (metadata.items as string[] | undefined) ??
      String(node.data.props?.text ?? "")
        .split("\n")
        .filter(Boolean);
    const ordered = metadata.listType === "ordered";
    const tag = ordered ? "ol" : "ul";
    return `<${tag}${ordered ? ` start="${Math.max(1, Number(metadata.start ?? 1))}"` : ""} style="margin:0;padding-left:${Number(metadata.indent ?? 24)}px;color:${String(style.color ?? "#202124")};font-family:${String(style.fontFamily ?? "Arial,sans-serif")};font-size:${Number(style.fontSize ?? 16)}px;line-height:${Number(style.lineHeight ?? 1.5)};text-align:${String(style.textAlign ?? "left")}">${items.map((item) => `<li style="padding-bottom:${Number(metadata.itemSpacing ?? 8)}px">${escapeEmailText(item)}</li>`).join("")}</${tag}>`;
  }
  if (role === "MANAGED_TABLE") {
    const table = (metadata.table as Record<string, unknown> | undefined) ?? {};
    const rows = (table.rows as string[][] | undefined) ?? [];
    const header = table.headerRow !== false;
    const borderColor = String(style.borderColor ?? "#d8dce5");
    return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;color:${String(style.color ?? "#202124")};font-family:${String(style.fontFamily ?? "Arial,sans-serif")};font-size:${Number(style.fontSize ?? 14)}px">${rows
      .map(
        (row, rowIndex) =>
          `<tr style="background:${table.striped && rowIndex % 2 ? "#f7f8fb" : rowIndex === 0 && header ? "#f1f3f7" : "transparent"}">${row
            .map((cell) => {
              const tag = rowIndex === 0 && header ? "th" : "td";
              return `<${tag} style="border:1px solid ${borderColor};padding:${Number(table.cellPadding ?? 10)}px;text-align:${String(table.align ?? "left")};${tag === "th" ? "font-weight:700;" : ""}">${escapeEmailText(cell)}</${tag}>`;
            })
            .join("")}</tr>`,
      )
      .join("")}</table>`;
  }
  return null;
}

function materializeManagedNodes(document: EmailDocument): EmailDocument {
  const next = structuredClone(document) as EmailDocument;
  for (const [id, node] of Object.entries(next as Record<string, StudioNode>)) {
    const contents = managedMarkup(node);
    if (contents)
      (next as Record<string, StudioNode>)[id] = {
        type: "Html",
        data: {
          style: ["MANAGED_LIST", "MANAGED_TABLE"].includes(editorRoleOf(node))
            ? node.data.style ?? {}
            : {},
          props: { contents },
        },
      };
  }
  return next;
}

function renderDocument(document: EmailDocument, sample = false): string {
  try {
    const html = renderToStaticMarkup(
      materializeManagedNodes(document) as TReaderDocument,
      {
        rootBlockId: ROOT_ID,
      },
    );
    return sample ? expandSampleData(html) : html;
  } catch {
    return '<div style="font-family:Arial,sans-serif;padding:32px">This draft contains an unsupported block. Open Structure and remove it.</div>';
  }
}

export const renderEmailDocument = renderDocument;

function frameDocument(html: string, preheader: string) {
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#f0f1f3">${hidden}${html}</body></html>`;
}

function targetSlot(
  document: EmailDocument,
  selectedId: string | null,
): ChildSlot {
  if (selectedId) {
    const own = slotsOf(document, selectedId)[0];
    if (own) return own;
    const parent = parentSlot(document, selectedId);
    if (parent) return parent;
  }
  return slotsOf(document, ROOT_ID)[0];
}

function TreeRow({
  id,
  document,
  depth,
  selectedId,
  onSelect,
}: {
  id: string;
  document: EmailDocument;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    paddingLeft: 8 + depth * 14,
  };
  const node = nodeOf(document, id);
  const children = slotsOf(document, id).flatMap((slot) => slot.ids);
  return (
    <>
      <button
        ref={setNodeRef}
        type="button"
        style={style}
        className={`ebs-tree-row ${selectedId === id ? "is-selected" : ""}`}
        onClick={() => onSelect(id)}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={13} aria-hidden />
        <span>{node?.type ?? "Block"}</span>
        <small>{id.slice(-4)}</small>
      </button>
      {children.map((child) => (
        <TreeRow
          key={child}
          id={child}
          document={document}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function CatalogueButton({
  item,
  disabled,
  onInsert,
}: {
  item: CatalogueItem;
  disabled: boolean;
  onInsert: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `catalogue:${item.key}`,
    disabled,
  });
  const style: CSSProperties = { opacity: isDragging ? 0.46 : 1 };
  const row = item.group === "Sections";
  const Icon = CATALOGUE_ICONS[item.key] ?? Sparkles;
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className={`${row ? `is-row is-${item.key}` : ""} ${item.premium ? "is-premium" : ""}`}
      disabled={disabled}
      onClick={onInsert}
      {...listeners}
      {...attributes}
    >
      <span className={row ? "ebs-row-thumbnail" : "ebs-catalogue-icon"}>
        {row ? (
          <>
            <b key="left" />
            <b key="middle" />
            <b key="right" />
          </>
        ) : (
          <Icon size={21} strokeWidth={1.7} />
        )}
      </span>
      <small>{item.label}</small>
      {item.premium ? <em>Pro</em> : null}
      <i>Drag</i>
    </button>
  );
}

function normalizeSavedFragment(
  value: Record<string, unknown>,
): FragmentDefinition | null {
  const candidate = value as {
    nodes?: unknown;
    rootIds?: unknown;
    root?: unknown;
  };
  if (
    candidate.nodes &&
    typeof candidate.nodes === "object" &&
    Array.isArray(candidate.rootIds)
  ) {
    const nodes = candidate.nodes as Record<string, StudioNode>;
    const rootIds = candidate.rootIds.filter(
      (id): id is string => typeof id === "string" && Boolean(nodes[id]),
    );
    return rootIds.length === candidate.rootIds.length && rootIds.length
      ? { nodes, rootIds }
      : null;
  }

  // Early studio builds stored a complete Waypoint document instead of the
  // fragment envelope. Preserve those rows by extracting their root children.
  if (candidate.root && typeof candidate.root === "object") {
    const document = value as EmailDocument;
    const rootIds =
      slotsOf(document, ROOT_ID)[0]?.ids.filter((id) =>
        Boolean(nodeOf(document, id)),
      ) ?? [];
    if (!rootIds.length) return null;
    const nodes = { ...value } as Record<string, StudioNode>;
    delete nodes[ROOT_ID];
    return { nodes, rootIds };
  }

  return null;
}

function blockMarkup(document: EmailDocument, id: string) {
  try {
    const node = nodeOf(document, id);
    const managed = node ? managedMarkup(node) : null;
    if (managed) return managed;
    const markup = expandSampleData(
      renderToStaticMarkup(document as TReaderDocument, { rootBlockId: id }),
    );
    return markup.match(/<body>([\s\S]*)<\/body>/i)?.[1] ?? markup;
  } catch {
    return '<div style="padding:18px;color:#667085">Unsupported email block</div>';
  }
}

function resolvedNodeStyle(
  node: StudioNode,
  viewport: "desktop" | "mobile" = "desktop",
): Record<string, unknown> {
  const source = (node.data.style ?? {}) as Record<string, unknown>;
  const responsive =
    (
      (node.data.editorMetadata as Record<string, unknown> | undefined)
        ?.responsiveStyle as Record<string, Record<string, unknown>> | undefined
    )?.[viewport] ?? {};
  return {
    ...source,
    ...responsive,
    padding: {
      ...((source.padding as object | undefined) ?? {}),
      ...((responsive.padding as object | undefined) ?? {}),
    },
  };
}

function blockStyle(
  node: StudioNode,
  viewport: "desktop" | "mobile" = "desktop",
): CSSProperties {
  const source = resolvedNodeStyle(node, viewport);
  const result: Record<string, unknown> = { ...source };
  if (source.padding && typeof source.padding === "object") {
    const padding = source.padding as Record<string, number>;
    result.padding = `${padding.top ?? 0}px ${padding.right ?? 0}px ${padding.bottom ?? 0}px ${padding.left ?? 0}px`;
  }
  return result as CSSProperties;
}

function alignmentStyle(value: unknown): CSSProperties {
  const alignment = String(value ?? "left");
  return {
    display: "flex",
    justifyContent:
      alignment === "center"
        ? "center"
        : alignment === "right"
          ? "flex-end"
          : "flex-start",
  };
}

function CanvasLeaf({
  node,
  viewport,
}: {
  node: StudioNode;
  viewport: "desktop" | "mobile";
}) {
  const props = (node.data.props ?? {}) as Record<string, unknown>;
  const metadata =
    (node.data.editorMetadata as Record<string, unknown> | undefined) ?? {};
  const style = blockStyle(node, viewport);
  const role = editorRoleOf(node);

  if (node.type === "Image") {
    const url = String(props.url ?? "");
    const alt = String(props.alt ?? metadata.accessibilityLabel ?? "");
    const width = Math.max(1, Number(props.width ?? 552));
    const imageStyle: CSSProperties = {
      display: "block",
      width,
      maxWidth: "100%",
      height: props.height ? Number(props.height) : "auto",
      borderRadius: Number(style.borderRadius ?? 0),
      borderStyle: String(style.borderStyle ?? "none") as CSSProperties["borderStyle"],
      borderWidth: Number(style.borderWidth ?? 0),
      borderColor: String(style.borderColor ?? "transparent"),
      objectFit: "cover",
    };
    const image =
      role.includes("ICON") && url ? (
        <span
          role="img"
          aria-label={alt}
          style={{
            ...imageStyle,
            backgroundColor: String(metadata.iconColor ?? "#4f46e5"),
            WebkitMaskImage: `url("${url.replaceAll('"', "%22")}")`,
            maskImage: `url("${url.replaceAll('"', "%22")}")`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            aspectRatio: "1",
          }}
        />
      ) : url ? (
        <img src={url} alt={alt} title={String(props.title ?? "")} style={imageStyle} />
      ) : (
        <span className="ebs-missing-media"><ImageIcon size={24} />Choose an image</span>
      );
    const linked = props.linkHref ? (
      <a href={String(props.linkHref)} onClick={(event) => event.preventDefault()}>
        {image}
      </a>
    ) : (
      image
    );
    return (
      <div style={{ ...style, ...alignmentStyle(style.textAlign) }}>{linked}</div>
    );
  }

  if (node.type === "Button") {
    const shape = String(props.buttonStyle ?? "rounded");
    return (
      <div style={{ ...style, ...alignmentStyle(style.textAlign) }}>
        <a
          href={String(props.url ?? "#")}
          onClick={(event) => event.preventDefault()}
          style={{
            display: props.fullWidth ? "block" : "inline-block",
            width: props.fullWidth ? "100%" : "auto",
            boxSizing: "border-box",
            padding: "12px 20px",
            borderRadius: shape === "pill" ? 999 : shape === "rectangle" ? 0 : 8,
            backgroundColor: String(props.buttonBackgroundColor ?? "#2f58bf"),
            color: String(props.buttonTextColor ?? "#ffffff"),
            textAlign: "center",
            textDecoration: "none",
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
          }}
        >
          {String(props.text ?? "Button")}
        </a>
      </div>
    );
  }

  if (node.type === "Divider") {
    return (
      <div style={style}>
        <div
          style={{
            borderTopStyle: String(props.lineStyle ?? "solid") as CSSProperties["borderTopStyle"],
            borderTopWidth: Math.max(1, Number(props.lineHeight ?? 1)),
            borderTopColor: String(props.lineColor ?? "#e7e9f2"),
          }}
        />
      </div>
    );
  }

  if (node.type === "Spacer")
    return <div style={{ ...style, minHeight: Math.max(4, Number(props.height ?? 28)) }} />;

  if (node.type === "Avatar") {
    const size = Math.max(24, Number(props.size ?? 64));
    const radius = props.shape === "circle" ? "50%" : props.shape === "rounded" ? 12 : 0;
    return (
      <div style={{ ...style, ...alignmentStyle(style.textAlign) }}>
        {props.imageUrl ? (
          <img
            src={String(props.imageUrl)}
            alt={String(props.alt ?? "")}
            style={{ width: size, height: size, objectFit: "cover", borderRadius: radius }}
          />
        ) : (
          <span className="ebs-missing-media" style={{ width: size, height: size, borderRadius: radius }}>
            <CircleUserRound size={Math.max(18, size / 2)} />
          </span>
        )}
      </div>
    );
  }

  return null;
}

function editableTextStyle(
  node: StudioNode,
  viewport: "desktop" | "mobile" = "desktop",
): CSSProperties {
  const source = resolvedNodeStyle(node, viewport);
  const padding = source.padding as Record<string, number> | undefined;
  const level = String(node.data.props?.level ?? "h2");
  return {
    color: String(source.color ?? "inherit"),
    backgroundColor: String(source.backgroundColor ?? "transparent"),
    fontSize: Number(
      source.fontSize ??
      (node.type === "Heading"
        ? level === "h1"
          ? 32
          : level === "h3"
            ? 18
            : 24
        : 16),
    ),
    fontWeight: String(
      source.fontWeight ?? (node.type === "Heading" ? "bold" : "normal"),
    ) as CSSProperties["fontWeight"],
    textAlign: String(source.textAlign ?? "left") as CSSProperties["textAlign"],
    padding: `${padding?.top ?? 14}px ${padding?.right ?? 24}px ${padding?.bottom ?? 14}px ${padding?.left ?? 24}px`,
    lineHeight: Number(
      source.lineHeight ?? (node.type === "Heading" ? 1.18 : 1.5),
    ),
    letterSpacing: Number(source.letterSpacing ?? 0),
    fontFamily: String(source.fontFamily ?? "inherit"),
    direction: String(source.direction ?? "ltr") as CSSProperties["direction"],
    textDecoration: String(source.textDecoration ?? "none"),
    fontStyle: String(
      source.fontStyle ?? "normal",
    ) as CSSProperties["fontStyle"],
    borderStyle: String(
      source.borderStyle ?? "none",
    ) as CSSProperties["borderStyle"],
    borderWidth: Number(source.borderWidth ?? 0),
    borderColor: String(source.borderColor ?? "transparent"),
    borderRadius: Number(source.borderRadius ?? 0),
    whiteSpace: "pre-wrap",
  };
}

function InlineText({
  node,
  viewport,
  editable,
  onCommit,
}: {
  node: StudioNode;
  viewport: "desktop" | "mobile";
  editable: boolean;
  onCommit: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const value = String(node.data.props?.text ?? "");
  useEffect(() => {
    if (
      ref.current &&
      window.document.activeElement !== ref.current &&
      ref.current.innerText !== value
    )
      ref.current.innerText = value;
  }, [value]);
  return (
    <div
      ref={ref}
      className={`ebs-inline-text is-${node.type.toLowerCase()}`}
      style={editableTextStyle(node, viewport)}
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-label={`Edit ${node.type.toLowerCase()} text`}
      onBlur={(event) => {
        const next = event.currentTarget.innerText.replace(/\n$/, "");
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.innerText = value;
          event.currentTarget.blur();
        }
        if (node.type === "Heading" && event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter")
          event.currentTarget.blur();
      }}
      onPaste={(event) => {
        event.preventDefault();
        window.document.execCommand(
          "insertText",
          false,
          event.clipboardData.getData("text/plain"),
        );
      }}
    >
      {value}
    </div>
  );
}

const dropId = (slot: ChildSlot, index: number) =>
  `drop:${slot.ownerId}:${slot.key}:${index}`;
function parseDropId(
  id: string,
): { ownerId: string; key: string; index: number } | null {
  if (!id.startsWith("drop:")) return null;
  const pieces = id.split(":");
  const index = Number(pieces.pop());
  const key = pieces.pop();
  const ownerId = pieces.slice(1).join(":");
  return key && ownerId && Number.isInteger(index)
    ? { ownerId, key, index }
    : null;
}

function DropZone({
  slot,
  index,
  active,
}: {
  slot: ChildSlot;
  index: number;
  active: boolean;
}) {
  const id = dropId(slot, index);
  const { setNodeRef, isOver } = useDroppable({ id });
  const label =
    slot.key === "root"
      ? "Place in email"
      : slot.key.startsWith("column-")
        ? `Place in column ${Number(slot.key.slice(7)) + 1}`
        : "Place in row";
  return (
    <div
      ref={setNodeRef}
      className={`ebs-drop-zone ${active ? "is-active" : ""} ${isOver ? "is-over" : ""}`}
      data-drop-target={id}
    >
      <span>
        <Plus size={11} />
        {label}
      </span>
    </div>
  );
}

type CanvasBlockProps = {
  id: string;
  document: EmailDocument;
  selectedId: string | null;
  editable: boolean;
  dragActive: boolean;
  viewport: "desktop" | "mobile";
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onTextCommit: (id: string, value: string) => void;
};

function SlotContent({
  slot,
  ...props
}: { slot: ChildSlot } & Omit<CanvasBlockProps, "id">) {
  return (
    <SortableContext items={slot.ids} strategy={verticalListSortingStrategy}>
      {slot.ids.map((child, index) => (
        <Fragment key={child}>
          <DropZone slot={slot} index={index} active={props.dragActive} />
          <CanvasBlock id={child} {...props} />
        </Fragment>
      ))}
      <DropZone slot={slot} index={slot.ids.length} active={props.dragActive} />
    </SortableContext>
  );
}

function CanvasBlock({
  id,
  document,
  selectedId,
  editable,
  dragActive,
  viewport,
  onSelect,
  onDuplicate,
  onDelete,
  onTextCommit,
}: CanvasBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id });
  const node = nodeOf(document, id);
  if (!node) return null;
  const slots = slotsOf(document, id);
  const selected = selectedId === id;
  const visibility =
    (node.data.editorMetadata as Record<string, unknown> | undefined) ?? {};
  const shellStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    display:
      (viewport === "mobile" && visibility.hideMobile === true) ||
        (viewport === "desktop" && visibility.hideDesktop === true)
        ? "none"
        : undefined,
  };
  let content: React.ReactNode;
  const managed = managedMarkup(node);
  if (
    managed &&
    ![
      "Image",
      "Button",
      "Divider",
      "Spacer",
      "Avatar",
      "Text",
      "Heading",
    ].includes(node.type)
  ) {
    content = (
      <div
        className="ebs-leaf-markup"
        style={blockStyle(node, viewport)}
        dangerouslySetInnerHTML={{ __html: managed }}
      />
    );
  } else if (node.type === "Container") {
    content = (
      <div className="ebs-native-container" style={blockStyle(node, viewport)}>
        {slots[0] ? (
          <SlotContent
            slot={slots[0]}
            document={document}
            selectedId={selectedId}
            editable={editable}
            dragActive={dragActive}
            viewport={viewport}
            onSelect={onSelect}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onTextCommit={onTextCommit}
          />
        ) : null}
      </div>
    );
  } else if (node.type === "ColumnsContainer") {
    const orientation = String(
      (node.data.editorMetadata as Record<string, unknown> | undefined)
        ?.orientation ?? "horizontal",
    );
    const stackOnMobile =
      (node.data.editorMetadata as Record<string, unknown> | undefined)
        ?.stackOnMobile !== false;
    const contentAlignment = String(node.data.props?.contentAlignment ?? "top");
    content = (
      <div
        className="ebs-native-columns"
        style={{
          ...blockStyle(node, viewport),
          gridTemplateColumns:
            orientation === "vertical" || (viewport === "mobile" && stackOnMobile)
              ? "minmax(0, 1fr)"
              : `repeat(${Math.max(1, slots.length)}, minmax(0,1fr))`,
          gap: Number(
            (node.data.props as Record<string, unknown> | undefined)
              ?.columnsGap ?? 16,
          ),
          alignItems:
            contentAlignment === "middle"
              ? "center"
              : contentAlignment === "bottom"
                ? "end"
                : "start",
        }}
      >
        {slots.map((slot) => (
          <div className="ebs-native-column" key={slot.key}>
            <SlotContent
              slot={slot}
              document={document}
              selectedId={selectedId}
              editable={editable}
              dragActive={dragActive}
              viewport={viewport}
              onSelect={onSelect}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onTextCommit={onTextCommit}
            />
            {!slot.ids.length && !dragActive ? (
              <span className="ebs-inline-drop">Drop content here</span>
            ) : null}
          </div>
        ))}
      </div>
    );
  } else if (node.type === "Text" || node.type === "Heading") {
    content = (
      <InlineText
        node={node}
        viewport={viewport}
        editable={editable}
        onCommit={(value) => onTextCommit(id, value)}
      />
    );
  } else if (["Image", "Button", "Divider", "Spacer", "Avatar"].includes(node.type)) {
    content = <CanvasLeaf node={node} viewport={viewport} />;
  } else {
    content = (
      <div
        className="ebs-leaf-markup"
        style={blockStyle(node, viewport)}
        dangerouslySetInnerHTML={{ __html: blockMarkup(document, id) }}
      />
    );
  }
  return (
    <div
      ref={setNodeRef}
      data-block-id={id}
      data-block-type={node.type}
      style={shellStyle}
      className={`ebs-canvas-block ${selected ? "is-selected" : ""} ${isOver ? "is-over" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(id);
      }}
    >
      {selected ? (
        <div className="ebs-block-actions">
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label="Drag block"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={15} />
          </button>
          <span>{capabilityFor(node).label}</span>
          <button
            type="button"
            aria-label="Duplicate block"
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate(id);
            }}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            aria-label="Delete block"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(id);
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <button
          ref={setActivatorNodeRef}
          className="ebs-block-grip"
          type="button"
          aria-label="Drag block"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      )}
      {content}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const body = window.document.body;
    const html = window.document.documentElement;
    const scrollY = window.scrollY;
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      htmlScrollBehavior: html.style.scrollBehavior,
    };
    html.style.scrollBehavior = "auto";
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overscrollBehavior = "none";
    return () => {
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.left = previous.bodyLeft;
      body.style.right = previous.bodyRight;
      body.style.width = previous.bodyWidth;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      html.style.overflow = previous.htmlOverflow;
      html.style.overscrollBehavior = previous.htmlOverscroll;
      html.style.scrollBehavior = previous.htmlScrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <div
      className="ebs-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className={`ebs-modal ${wide ? "is-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <strong>{title}</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="ebs-control">
      <span>{label}</span>
      {children}
    </label>
  );
}
const asStyle = (node: StudioNode | null) => node?.data.style ?? {};
const asProps = (node: StudioNode | null) => node?.data.props ?? {};
const preciseCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const pointerDropZones = pointerHits.filter((hit) =>
    String(hit.id).startsWith("drop:"),
  );
  if (pointerDropZones.length) return pointerDropZones;
  if (pointerHits.length) return pointerHits;
  const intersections = rectIntersection(args);
  const intersectedDropZones = intersections.filter((hit) =>
    String(hit.id).startsWith("drop:"),
  );
  return intersectedDropZones.length
    ? intersectedDropZones
    : intersections.length
      ? intersections
      : closestCenter(args);
};

function SearchableOrgSelect({
  organizations,
  value,
  onChange,
}: {
  organizations: Array<{ id: string; name: string; slug?: string }>;
  value?: string | null;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return organizations;
    const term = search.toLowerCase();
    return organizations.filter(
      (org) =>
        org.name.toLowerCase().includes(term) ||
        (org.slug && org.slug.toLowerCase().includes(term)),
    );
  }, [organizations, search]);

  const selectedOrg = organizations.find((o) => o.id === value);

  return (
    <div className="ebs-searchable-select">
      <button
        type="button"
        className="ebs-select-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selectedOrg ? selectedOrg.name : "Select an organization…"}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="ebs-select-dropdown">
          <div className="ebs-select-search-box">
            <Search size={14} />
            <input
              type="text"
              autoFocus
              placeholder="Search organization by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="ebs-select-options">
            {filtered.map((org) => (
              <button
                key={org.id}
                type="button"
                className={`ebs-select-option ${org.id === value ? "is-selected" : ""}`}
                onClick={() => {
                  onChange(org.id);
                  setOpen(false);
                }}
              >
                <span>{org.name}</span>
                {org.slug ? <small>({org.slug})</small> : null}
              </button>
            ))}
            {!filtered.length ? (
              <div className="ebs-select-empty">No matching organization</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EmailTemplateGrid({
  templates,
  scopeLabel,
  activeTemplateId,
  onSelectTemplate,
  onRequestCreateNew,
  onCreateTemplate,
  onDeleteTemplate,
  onDuplicateTemplate,
  onSendTest,
  onOpenEditor,
  onOpenDetails,
}: {
  templates: StudioTemplate[];
  scopeLabel: string;
  activeTemplateId: string | null;
  onSelectTemplate?: (id: string) => void;
  onRequestCreateNew?: () => void;
  onCreateTemplate?: (template: { name: string; stableKey: string }) => void;
  onDeleteTemplate?: (id: string) => Promise<void> | void;
  onDuplicateTemplate?: (id: string) => Promise<StudioTemplate | void>;
  onSendTest?: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onOpenDetails: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [orderBy, setOrderBy] = useState<"updated" | "name">("updated");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<StudioTemplate | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateKey, setNewTemplateKey] = useState("");

  const filtered = useMemo(() => {
    let result = templates;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.stableKey.toLowerCase().includes(q),
      );
    }
    if (typeFilter !== "All") {
      result = result.filter(
        (t) =>
          t.stableKey.toLowerCase().includes(typeFilter.toLowerCase()) ||
          t.scopeType.toLowerCase().includes(typeFilter.toLowerCase()),
      );
    }
    if (orderBy === "name") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [templates, search, typeFilter, orderBy]);

  return (
    <div className="ebs-projects-page" onClick={() => setOpenMenuId(null)}>
      {/* Top Header Bar */}
      <div className="ebs-projects-header">
        <div>
          <h1 className="ebs-projects-title">Projects</h1>
          <span className="ebs-projects-scope-badge">{scopeLabel}</span>
        </div>
        <div className="ebs-projects-actions">
          {onRequestCreateNew || onCreateTemplate ? (
            <button
              type="button"
              className="ebs-btn-create-primary"
              onClick={() => onRequestCreateNew ? onRequestCreateNew() : setCreateOpen(true)}
            >
              <Plus size={16} />
              Create new
            </button>
          ) : null}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="ebs-projects-filter-bar">
        <div className="ebs-filter-selects">
          <div className="ebs-filter-item">
            <label>Order by:</label>
            <select
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value as "updated" | "name")}
            >
              <option value="updated">Last updated...</option>
              <option value="name">Template Name (A-Z)</option>
            </select>
          </div>
          <div className="ebs-filter-item">
            <label>Type:</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="All">All</option>
              <option value="speaker">Speaker</option>
              <option value="participant">Participant</option>
              <option value="attendee">Attendee</option>
            </select>
          </div>
        </div>
        <div className="ebs-search-field">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search in Your workspace"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="ebs-projects-meta-line">
        <span>Designs <strong>{filtered.length}</strong>/{templates.length}</span>
      </div>

      {/* Card Grid */}
      <div className="ebs-projects-grid">
        {/* Create Card */}
        {onRequestCreateNew || onCreateTemplate ? (
          <div
            className="ebs-card ebs-card-create"
            onClick={() => onRequestCreateNew ? onRequestCreateNew() : setCreateOpen(true)}
          >
            <div className="ebs-card-create-body">
              <div className="ebs-create-plus-icon">
                <Plus size={26} />
              </div>
              <strong>Create New Template</strong>
              <span>Start from scratch or blank layout</span>
            </div>
          </div>
        ) : null}
        {filtered.map((template) => {
          const isMenuOpen = openMenuId === template.id;
          const canDelete = Boolean(onDeleteTemplate) && template.editable;

          return (
            <div
              key={template.id}
              className={`ebs-card ${activeTemplateId === template.id ? "is-selected-card" : ""}`}
              onClick={() => {
                onSelectTemplate?.(template.id);
                onOpenDetails(template.id);
              }}
            >
              {/* 3-dots Menu Button (outside overflow:hidden preview box) */}
              <div
                className="ebs-card-menu-anchor"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="ebs-card-dots-btn"
                  title="Template options"
                  onClick={() => setOpenMenuId(isMenuOpen ? null : template.id)}
                >
                  <MoreVertical size={16} />
                </button>

                {/* Dropdown Menu on Hover/Click */}
                {isMenuOpen ? (
                  <div className="ebs-card-menu-dropdown">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenuId(null);
                        onSelectTemplate?.(template.id);
                        onOpenDetails(template.id);
                      }}
                    >
                      <Pencil size={14} />
                      View details
                    </button>

                    {onSendTest ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onSelectTemplate?.(template.id);
                          onSendTest(template.id);
                        }}
                      >
                        <Send size={14} />
                        Send test
                      </button>
                    ) : null}

                    {onDuplicateTemplate ? (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          setOpenMenuId(null);
                          const copy = await onDuplicateTemplate(template.id);
                          if (copy) {
                            onOpenEditor(copy.id);
                          }
                        }}
                      >
                        <Copy size={14} />
                        Make a copy
                      </button>
                    ) : null}

                    {canDelete ? (
                      <button
                        type="button"
                        className="is-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(null);
                          setTemplateToDelete(template);
                        }}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    ) : (
                      <div className="ebs-menu-disabled-item" title="Platform default templates cannot be deleted by organization users">
                        <Lock size={12} />
                        <span>System default</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Preview Box */}
              <div className="ebs-card-preview-box">
                <div className="ebs-type-tag">
                  <Mail size={11} />
                  <span>Email</span>
                </div>

                {/* HTML Iframe Preview */}
                <iframe
                  title={template.name}
                  srcDoc={template.bodyHtml}
                  className="ebs-card-preview-iframe"
                  tabIndex={-1}
                />
              </div>

              {/* Card Footer */}
              <div className="ebs-card-info">
                <div className="ebs-card-name">{template.name}</div>
                <div className="ebs-card-subtext">
                  <span>{template.effectiveOrigin ?? template.scopeType}</span>
                  <span>{template.version ? `v${template.version}` : "Draft"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {templateToDelete ? (
        <div className="ebs-modal-overlay" onClick={() => setTemplateToDelete(null)}>
          <div className="ebs-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Template</h3>
            <p>
              Are you sure you want to delete <strong>{templateToDelete.name}</strong>? This action cannot be undone.
            </p>
            <div className="ebs-modal-footer">
              <button
                type="button"
                className="ebs-btn-cancel"
                onClick={() => setTemplateToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ebs-btn-danger"
                onClick={async () => {
                  if (onDeleteTemplate) {
                    await onDeleteTemplate(templateToDelete.id);
                  }
                  setTemplateToDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Create Modal */}
      {createOpen ? (
        <div className="ebs-modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="ebs-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Email Template</h3>
            <p>Specify a friendly name and unique key for this template.</p>
            <div className="ebs-form-group">
              <label>Template Name</label>
              <input
                type="text"
                placeholder="e.g. Speaker Welcome Email"
                value={newTemplateName}
                onChange={(e) => {
                  setNewTemplateName(e.target.value);
                  if (!newTemplateKey) {
                    setNewTemplateKey(
                      e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    );
                  }
                }}
              />
            </div>
            <div className="ebs-form-group">
              <label>Stable Key</label>
              <input
                type="text"
                placeholder="e.g. speaker-welcome-email"
                value={newTemplateKey}
                onChange={(e) => setNewTemplateKey(e.target.value)}
              />
            </div>
            <div className="ebs-modal-footer">
              <button
                type="button"
                className="ebs-btn-cancel"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ebs-btn-primary"
                disabled={!newTemplateName.trim() || !newTemplateKey.trim()}
                onClick={async () => {
                  if (onCreateTemplate) {
                    await onCreateTemplate({
                      name: newTemplateName.trim(),
                      stableKey: newTemplateKey.trim(),
                    });
                  }
                  setCreateOpen(false);
                  setNewTemplateName("");
                  setNewTemplateKey("");
                }}
              >
                Create Template
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


function TemplateDetailsView({
  template,
  scopeLabel,
  organizations = [],
  onBackToGallery,
  onOpenEditor,
  onSaveDraft,
  onUpdateScope,
  onDuplicateTemplate,
  onDeleteTemplate,
  onSendTest,
  onLoadVersions,
  onRollback,
}: {
  template: StudioTemplate;
  scopeLabel: string;
  organizations?: Array<{ id: string; name: string; slug?: string }>;
  onBackToGallery: () => void;
  onOpenEditor: () => void;
  onSaveDraft: (draft: StudioDraft) => Promise<void>;
  onUpdateScope?: (
    id: string,
    scopeType: "PLATFORM" | "ORGANIZATION",
    organizationId?: string | null,
  ) => Promise<void>;
  onDuplicateTemplate?: (id: string) => Promise<StudioTemplate | void>;
  onDeleteTemplate?: (id: string) => Promise<void> | void;
  onSendTest?: (id: string) => void;
  onLoadVersions?: (template: StudioTemplate) => Promise<StudioVersion[]>;
  onRollback?: (
    template: StudioTemplate,
    versionId: string,
    reason: string,
  ) => Promise<void>;
}) {
  const [tab, setTab] = useState<"details" | "review" | "history">("details");
  const [name, setName] = useState(template.name);
  const [editingName, setEditingName] = useState(false);
  const [subject, setSubject] = useState(template.subject);
  const [preheader, setPreheader] = useState(template.preheader ?? "");
  const [editingSubject, setEditingSubject] = useState(false);
  const [activeStatus, setActiveStatus] = useState(template.lifecycleState !== "ARCHIVED");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [versionsList, setVersionsList] = useState<StudioVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    setName(template.name);
    setSubject(template.subject);
    setPreheader(template.preheader ?? "");
    setActiveStatus(template.lifecycleState !== "ARCHIVED");
  }, [template]);

  useEffect(() => {
    if (tab === "history" && onLoadVersions) {
      setLoadingVersions(true);
      onLoadVersions(template)
        .then((res) => setVersionsList(res))
        .finally(() => setLoadingVersions(false));
    }
  }, [tab, template, onLoadVersions]);

  const saveDetails = async () => {
    setBusy(true);
    try {
      await onSaveDraft({
        templateId: template.id,
        name: name.trim(),
        subject: subject.trim(),
        preheader: preheader.trim(),
        designerJson: template.designerJson ?? createBlankEmailDocument(),
        bodyHtml: template.bodyHtml,
        editorSchemaVersion: 4,
        expectedVersion: template.version,
      });
      setEditingName(false);
      setEditingSubject(false);
    } finally {
      setBusy(false);
    }
  };

  const canDelete = Boolean(onDeleteTemplate) && template.editable;

  return (
    <div className="ebs-template-details-page">
      {/* Top Breadcrumbs Navigation Header */}
      <div className="ebs-details-top-nav">
        <div className="ebs-breadcrumbs">
          <button type="button" className="ebs-crumb-link" onClick={onBackToGallery}>
            Projects
          </button>
          <span className="ebs-crumb-sep">›</span>
          <span className="ebs-crumb-current">{template.name}</span>
          <span className="ebs-crumb-tag">
            <Mail size={12} />
          </span>
        </div>
      </div>

      {/* Main Two-Column View */}
      <div className="ebs-details-main-grid">
        {/* Left Column: Live Email Preview Box */}
        <div className="ebs-details-preview-col">
          <div className="ebs-preview-window-frame">
            <div className="ebs-preview-window-dots">
              <span />
              <span />
              <span />
            </div>
            <iframe
              title={template.name}
              srcDoc={template.bodyHtml}
              className="ebs-preview-window-iframe"
            />
          </div>
        </div>

        {/* Right Column: Settings & Details Panel */}
        <div className="ebs-details-panel-col">
          {/* Tabs Bar */}
          <div className="ebs-details-tabs">
            <button
              type="button"
              className={tab === "details" ? "is-active-tab" : ""}
              onClick={() => setTab("details")}
            >
              Email Details
            </button>
            <button
              type="button"
              className={tab === "history" ? "is-active-tab" : ""}
              onClick={() => setTab("history")}
            >
              Version Audit Log
            </button>
          </div>

          {/* Subheader Meta Bar */}
          <div className="ebs-details-meta-bar">
            <span className="ebs-meta-text">
              Last edit v{template.version} · {template.effectiveOrigin ?? template.scopeType}
            </span>
            <div className="ebs-meta-actions">
              <button
                type="button"
                className="ebs-btn-edit-email"
                onClick={onOpenEditor}
              >
                <Pencil size={15} />
                Edit email
              </button>
              {onDuplicateTemplate ? (
                <button
                  type="button"
                  className="ebs-btn-duplicate-action"
                  title="Make a copy of this template"
                  onClick={() => onDuplicateTemplate(template.id)}
                >
                  <Copy size={15} />
                  Make a copy
                </button>
              ) : null}
            </div>
          </div>

          {tab === "details" ? (
            <div className="ebs-details-cards-stack">
              {/* Card 1: Template Name */}
              <div className="ebs-details-card">
                <div className="ebs-card-header-row">
                  <strong>{editingName ? "Edit Template Name" : template.name}</strong>
                  <button
                    type="button"
                    className="ebs-icon-edit-btn"
                    onClick={() => setEditingName((v) => !v)}
                  >
                    <Pencil size={15} />
                  </button>
                </div>
                {editingName ? (
                  <div className="ebs-card-edit-body">
                    <input
                      type="text"
                      className="ebs-input-field"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <div className="ebs-card-save-row">
                      <button
                        type="button"
                        className="ebs-btn-cancel"
                        onClick={() => setEditingName(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="ebs-btn-primary"
                        disabled={busy}
                        onClick={saveDetails}
                      >
                        Save Name
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Card 2: Subject & Preheader */}
              <div className="ebs-details-card">
                <div className="ebs-card-header-row">
                  <div>
                    <strong>Subject & Preheader</strong>
                    <p className="ebs-card-sub-desc">
                      {subject ? `Subject: ${subject}` : "No subject defined"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ebs-icon-edit-btn"
                    onClick={() => setEditingSubject((v) => !v)}
                  >
                    <Pencil size={15} />
                  </button>
                </div>
                {editingSubject ? (
                  <div className="ebs-card-edit-body">
                    <div className="ebs-form-group">
                      <label>Subject Line</label>
                      <input
                        type="text"
                        className="ebs-input-field"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    </div>
                    <div className="ebs-form-group">
                      <label>Preheader Text</label>
                      <input
                        type="text"
                        className="ebs-input-field"
                        value={preheader}
                        onChange={(e) => setPreheader(e.target.value)}
                      />
                    </div>
                    <div className="ebs-card-save-row">
                      <button
                        type="button"
                        className="ebs-btn-cancel"
                        onClick={() => setEditingSubject(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="ebs-btn-primary"
                        disabled={busy}
                        onClick={saveDetails}
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Card 3: Scope & Availability */}
              {onUpdateScope ? (
                <div className="ebs-details-card">
                  <strong>Template Scope & Availability</strong>
                  <p className="ebs-card-sub-desc">
                    Control whether this template is available to all tenant organizations or a specific organization.
                  </p>
                  <div className="ebs-scope-select-wrap">
                    <select
                      className="ebs-select-field"
                      value={template.organizationId ? "ORGANIZATION" : "PLATFORM"}
                      onChange={async (e) => {
                        const nextType = e.target.value as "PLATFORM" | "ORGANIZATION";
                        if (nextType === "PLATFORM") {
                          await onUpdateScope(template.id, "PLATFORM", null);
                        } else {
                          const firstOrg = organizations[0]?.id ?? null;
                          await onUpdateScope(template.id, "ORGANIZATION", firstOrg);
                        }
                      }}
                    >
                      <option value="PLATFORM">All Tenants / Organizations (Public Default)</option>
                      <option value="ORGANIZATION">Specific Organization Only</option>
                    </select>
                    {template.organizationId || (organizations && organizations.length > 0) ? (
                      <div className="ebs-scope-org-picker-wrap">
                        <small>Assigned Organization:</small>
                        <SearchableOrgSelect
                          organizations={organizations}
                          value={template.organizationId}
                          onChange={async (orgId) => {
                            await onUpdateScope(template.id, "ORGANIZATION", orgId);
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Card 4: Active Status Switch */}
              <div className="ebs-details-card ebs-toggle-card">
                <div>
                  <strong>Active Status</strong>
                  <p className="ebs-card-sub-desc">
                    Enable or disable this template for event notifications.
                  </p>
                </div>
                <label className="ebs-switch-toggle">
                  <input
                    type="checkbox"
                    checked={activeStatus}
                    onChange={(e) => setActiveStatus(e.target.checked)}
                  />
                  <span className="ebs-switch-slider" />
                </label>
              </div>

              {/* Bottom Quick Actions Row */}
              <div className="ebs-details-bottom-actions">
                {onSendTest ? (
                  <button
                    type="button"
                    className="ebs-bottom-action-btn"
                    onClick={() => onSendTest(template.id)}
                  >
                    <Send size={14} />
                    Send test
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    className="ebs-bottom-action-btn is-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(true);
                    }}
                  >
                    <Trash2 size={14} />
                    Delete template
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="ebs-details-tab-panel">
              <h3>Version Audit Log</h3>
              {loadingVersions ? (
                <p>Loading historical template versions...</p>
              ) : (
                <div className="ebs-versions-list">
                  {versionsList.map((ver) => (
                    <div key={ver.id} className="ebs-version-row">
                      <div>
                        <strong>v{ver.version}</strong> · {ver.lifecycleState}
                        <small className="ebs-version-date">
                          {ver.publishedAt ? new Date(ver.publishedAt).toLocaleString() : "Draft"}
                        </small>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {ver.lifecycleState !== "DRAFT" && onRollback ? (
                          <button
                            type="button"
                            className="ebs-btn-cancel"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRollback(template, ver.id, "Restored from Details view");
                            }}
                          >
                            Restore v{ver.version}
                          </button>
                        ) : null}
                        {onDuplicateTemplate ? (
                          <button
                            type="button"
                            className="ebs-btn-cancel"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast.error("Copying individual versions is not supported by the API.");
                            }}
                          >
                            Copy
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            className="ebs-btn-cancel is-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast.error("Deleting individual versions is not supported. You can only delete the entire template.");
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Pop-up Modal Window */}
      {deleteConfirm ? (
        <div className="ebs-modal-overlay" onClick={() => setDeleteConfirm(false)}>
          <div className="ebs-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Template</h3>
            <p>
              Are you sure you want to delete <strong>{template.name}</strong>? This action cannot be undone and will permanently remove this template from your workspace.
            </p>
            <div className="ebs-modal-footer">
              <button
                type="button"
                className="ebs-btn-cancel"
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ebs-btn-danger"
                onClick={async () => {
                  if (onDeleteTemplate) {
                    await onDeleteTemplate(template.id);
                  }
                  setDeleteConfirm(false);
                  onBackToGallery();
                }}
              >
                Delete Template
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


export function EmailBuilderStudio({
  templates,
  activeTemplateId,
  variables,
  fragments = [],
  assets = [],
  brandingPolicy = {
    enabled: true,
    text: "In collaboration with EventOS",
    version: 1,
  },
  readOnly = false,
  busy = false,
  scopeLabel,
  organizations = [],
  onSelectTemplate,
  onDeleteTemplate,
  onDuplicateTemplate,
  onUpdateScope,
  onRequestCreateNew,
  onCreateTemplate,
  onSaveDraft,
  onPublish,
  onLoadVersions,
  onRollback,
  onUploadAsset,
  onImportAsset,
  onPreview,
  onSendTest,
  onSaveFragment,
  onArchive,
  onExit,
}: EmailBuilderStudioProps) {
  const [viewMode, setViewMode] = useState<"gallery" | "details" | "editor">("gallery");
  const active =
    templates.find((item) => item.id === activeTemplateId) ?? templates[0];
  const [document, setDocument] = useState<EmailDocument>(
    () => active?.designerJson ?? createBlankEmailDocument(),
  );
  const [name, setName] = useState(active?.name ?? "Untitled email");
  const [subject, setSubject] = useState(
    active?.subject ?? "{{EventName}} update",
  );
  const [preheader, setPreheader] = useState(active?.preheader ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(ROOT_ID);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("content");
  const [screen, setScreen] = useState<"desktop" | "mobile">("desktop");
  const [tool, setTool] = useState<Tool>("components");
  const [catalogueTab, setCatalogueTab] = useState<CatalogueTab>("blocks");
  const [leftOpen, setLeftOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("content");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaTab, setMediaTab] = useState<MediaTab>("library");
  const [mediaKind, setMediaKind] = useState<"IMAGE" | "ICON">("IMAGE");
  const [mediaSearch, setMediaSearch] = useState("");
  const [iconSearch, setIconSearch] = useState("");
  const [iconCategory, setIconCategory] = useState("All");
  const [assetScope, setAssetScope] = useState("ALL");
  const [iconLoading, setIconLoading] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [history, setHistory] = useState<EmailDocument[]>([]);
  const [future, setFuture] = useState<EmailDocument[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateKey, setNewTemplateKey] = useState("");
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [versions, setVersions] = useState<StudioVersion[]>([]);
  const [rollbackVersionId, setRollbackVersionId] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [structureOpen, setStructureOpen] = useState(false);
  const [publishMenu, setPublishMenu] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [serverPreviewHtml, setServerPreviewHtml] = useState<string | null>(
    null,
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [fragmentName, setFragmentName] = useState("");
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [styleClipboard, setStyleClipboard] = useState<Record<
    string,
    unknown
  > | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentTemplateRef = useRef(active?.id);
  const editable = Boolean(active?.editable) && !readOnly;
  const rootIds = slotsOf(document, ROOT_ID)[0]?.ids ?? [];
  const selected = selectedId ? nodeOf(document, selectedId) : null;
  const managedIconAssets = useMemo(
    () => assets.filter(isManagedIconAsset),
    [assets],
  );
  const managedImageAssets = useMemo(
    () => assets.filter((asset) => !isManagedIconAsset(asset)),
    [assets],
  );
  const visibleSavedIcons = useMemo(() => {
    const query = iconSearch.trim().toLowerCase();
    return managedIconAssets.filter(
      (asset) =>
        (assetScope === "ALL" || asset.scopeType === assetScope) &&
        (!query || asset.name.toLowerCase().includes(query)),
    );
  }, [assetScope, iconSearch, managedIconAssets]);
  const rawHtml = useMemo(() => renderDocument(document), [document]);
  const previewHtml = useMemo(() => renderDocument(document, true), [document]);
  const framedPreview = useMemo(
    () => frameDocument(previewHtml, expandSampleData(preheader)),
    [preheader, previewHtml],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 90, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const { setNodeRef: setCanvasDropRef, isOver: canvasIsOver } = useDroppable({
    id: "canvas-root",
  });

  useEffect(() => {
    if (!active || currentTemplateRef.current === active.id) return;
    currentTemplateRef.current = active.id;
    const next = active.designerJson ?? createBlankEmailDocument();
    setDocument(next);
    setName(active.name);
    setSubject(active.subject);
    setPreheader(active.preheader ?? "");
    selectNode(ROOT_ID);
    setHistory([]);
    setFuture([]);
    setSaveState("saved");
    setDiagnostics([]);
  }, [active]);

  const commit = useCallback(
    (next: EmailDocument) => {
      setHistory((items) => [...items.slice(-49), document]);
      setFuture([]);
      setDocument(next);
      setSaveState("dirty");
    },
    [document],
  );
  const buildDraft = useCallback(
    (): StudioDraft | null =>
      active
        ? {
          templateId: active.id,
          name: name.trim(),
          subject: subject.trim(),
          preheader: preheader.trim(),
          designerJson: document,
          bodyHtml: rawHtml,
          editorSchemaVersion: 4,
          expectedVersion: active.version,
        }
        : null,
    [active, document, name, preheader, rawHtml, subject],
  );
  const save = useCallback(async () => {
    const draft = buildDraft();
    if (!draft || !editable || saveState === "saving") return;
    setSaveState("saving");
    setDiagnostics([]);
    try {
      await onSaveDraft(draft);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setDiagnostics([
        error instanceof Error ? error.message : "Draft could not be saved.",
      ]);
    }
  }, [buildDraft, editable, onSaveDraft, saveState]);

  useEffect(() => {
    if (saveState !== "dirty" || !editable) return;
    const timer = window.setTimeout(() => void save(), 1500);
    return () => window.clearTimeout(timer);
  }, [editable, save, saveState]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (["dirty", "saving"].includes(saveState)) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
      if (command && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if (
        command &&
        ((event.key.toLowerCase() === "z" && event.shiftKey) ||
          event.key.toLowerCase() === "y")
      ) {
        event.preventDefault();
        redo();
      }
      if (command && event.key.toLowerCase() === "d" && selectedId) {
        event.preventDefault();
        duplicateSelected();
      }
      if (command && event.key.toLowerCase() === "p") {
        event.preventDefault();
        void runPreview();
      }
      if (event.altKey && event.key === "ArrowUp" && selectedId) {
        event.preventDefault();
        moveSelected(-1);
      }
      if (event.altKey && event.key === "ArrowDown" && selectedId) {
        event.preventDefault();
        moveSelected(1);
      }
      if (event.altKey && event.key === "1") {
        event.preventDefault();
        setSidebarTab("content");
        setSelectedId(null);
      }
      if (event.altKey && event.key === "2") {
        event.preventDefault();
        setSidebarTab("rows");
        setSelectedId(null);
      }
      if (event.altKey && event.key === "3") {
        event.preventDefault();
        setSidebarTab("style");
        setSelectedId(ROOT_ID);
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedId &&
        window.document.activeElement?.tagName === "BODY"
      )
        removeSelected();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev || !editable) return;
    setFuture((items) => [document, ...items]);
    setHistory((items) => items.slice(0, -1));
    setDocument(prev);
    setSaveState("dirty");
  };
  const redo = () => {
    const next = future[0];
    if (!next || !editable) return;
    setHistory((items) => [...items, document]);
    setFuture((items) => items.slice(1));
    setDocument(next);
    setSaveState("dirty");
  };
  const updateNode = (
    area: "props" | "style",
    patch: Record<string, unknown>,
  ) => {
    if (!selectedId) return;
    const node = document[selectedId];
    if (!node) return;
    const nodeData = node.data as unknown as Record<string, unknown>;
    commit({
      ...document,
      [selectedId]: {
        ...node,
        data: {
          ...nodeData,
          [area]: { ...(nodeData[area] as object | undefined), ...patch },
        },
      },
    } as EmailDocument);
  };
  const updateMetadata = (patch: Record<string, unknown>) => {
    if (!selectedId || !selected) return;
    commit({
      ...document,
      [selectedId]: {
        ...selected,
        data: {
          ...selected.data,
          editorSchemaVersion: 4,
          editorMetadata: {
            ...((selected.data.editorMetadata as object | undefined) ?? {}),
            ...patch,
          },
        },
      },
    } as EmailDocument);
  };
  const updateResponsiveStyle = (
    viewport: "desktop" | "mobile",
    patch: Record<string, unknown>,
  ) => {
    const responsive =
      ((selected?.data.editorMetadata as Record<string, unknown> | undefined)
        ?.responsiveStyle as
        Record<string, Record<string, unknown>> | undefined) ?? {};
    updateMetadata({
      responsiveStyle: {
        ...responsive,
        [viewport]: { ...(responsive[viewport] ?? {}), ...patch },
      },
    });
  };
  const updateTextById = (id: string, value: string) => {
    const node = nodeOf(document, id);
    if (!node || !["Text", "Heading"].includes(node.type)) return;
    commit({
      ...document,
      [id]: {
        ...node,
        data: { ...node.data, props: { ...node.data.props, text: value } },
      },
    } as EmailDocument);
  };
  const updateRoot = (patch: Record<string, unknown>) => {
    const root = nodeOf(document, ROOT_ID);
    commit({
      ...document,
      root: { ...root, data: { ...root.data, ...patch } },
    } as EmailDocument);
  };
  const selectNode = (id: string | null) => {
    setSelectedId(id);
    if (!id) {
      setSidebarTab("content");
      setInspectorTab("content");
    } else if (id === ROOT_ID) {
      setSidebarTab("style");
      setInspectorTab("settings");
    } else if (isStructuralNode(nodeOf(document, id))) {
      setSidebarTab("rows");
      setInspectorTab("style");
    } else {
      setSidebarTab("content");
      setInspectorTab("content");
    }
  };
  const insertFragment = (
    fragment: { nodes: Record<string, StudioNode>; rootIds: string[] },
    preferredSlot?: ChildSlot,
  ) => {
    if (!editable) return;
    const slot = preferredSlot ?? targetSlot(document, selectedId);
    const next = { ...document, ...fragment.nodes } as EmailDocument;
    commit(writeSlot(next, slot, [...slot.ids, ...fragment.rootIds]));
    selectNode(fragment.rootIds[0] ?? null);
  };
  const addCatalogue = (item: CatalogueItem) =>
    insertFragment(
      createCatalogueFragment(item.key),
      item.group !== "Basic" || item.key === "social"
        ? slotsOf(document, ROOT_ID)[0]
        : undefined,
    );
  const addSocialIcon = () => {
    if (!selectedId || editorRoleOf(selected) !== "SOCIAL_GROUP" || !editable)
      return;
    const columns = [
      ...((selected?.data.props?.columns as
        Array<{ childrenIds: string[] }> | undefined) ?? []),
    ];
    if (columns.length >= 12) return;
    const iconId = `social-icon-${crypto.randomUUID().slice(0, 8)}`;
    const icon: StudioNode = {
      type: "Image",
      data: {
        style: {
          padding: { top: 10, right: 12, bottom: 10, left: 12 },
          textAlign: "center",
        },
        props: {
          url: "https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/link.svg",
          alt: "Social link",
          width: 28,
          linkHref: "https://",
        },
        editorRole: "SOCIAL_ICON",
        editorSchemaVersion: 4,
        editorMetadata: {
          network: "Custom",
          action: { type: "WEB", href: "https://" },
          accessibilityLabel: "Social link",
        },
      },
    };
    const nextColumns = [...columns, { childrenIds: [iconId] }];
    commit({
      ...document,
      [iconId]: icon,
      [selectedId]: {
        ...selected!,
        data: {
          ...selected!.data,
          props: {
            ...selected!.data.props,
            columns: nextColumns,
            columnsCount: nextColumns.length,
          },
        },
      },
    } as EmailDocument);
    setSelectedId(iconId);
    setSidebarTab("content");
    setInspectorTab("content");
    openMedia("ICON");
  };
  const removeById = (id: string) => {
    if (id === ROOT_ID || !editable) return;
    const node = nodeOf(document, id);
    const parent = parentSlot(document, id);
    if (
      editorRoleOf(node) === "SOCIAL_ICON" &&
      parent?.key.startsWith("column-")
    ) {
      const group = nodeOf(document, parent.ownerId);
      if (editorRoleOf(group) === "SOCIAL_GROUP") {
        const columnIndex = Number(parent.key.slice(7));
        const columns = (
          (group.data.props?.columns as
            Array<{ childrenIds: string[] }> | undefined) ?? []
        ).filter((_, index) => index !== columnIndex);
        const next = removeSubtree(document, id);
        commit({
          ...next,
          [parent.ownerId]: {
            ...group,
            data: {
              ...group.data,
              props: {
                ...group.data.props,
                columns,
                columnsCount: columns.length,
              },
            },
          },
        } as EmailDocument);
        selectNode(parent.ownerId);
        return;
      }
    }
    commit(removeSubtree(document, id));
    selectNode(ROOT_ID);
  };
  const removeSelected = () => {
    if (selectedId) removeById(selectedId);
  };
  const duplicateById = (id: string) => {
    if (id === ROOT_ID || !editable) return;
    const parent = parentSlot(document, id);
    if (!parent) return;
    const clone = cloneSubtree(document, id);
    const node = nodeOf(document, id);
    const group = nodeOf(document, parent.ownerId);
    if (
      editorRoleOf(node) === "SOCIAL_ICON" &&
      editorRoleOf(group) === "SOCIAL_GROUP" &&
      parent.key.startsWith("column-")
    ) {
      const columns = [
        ...((group.data.props?.columns as
          Array<{ childrenIds: string[] }> | undefined) ?? []),
      ];
      const index = Number(parent.key.slice(7));
      columns.splice(index + 1, 0, { childrenIds: [clone.rootId] });
      commit({
        ...document,
        ...clone.nodes,
        [parent.ownerId]: {
          ...group,
          data: {
            ...group.data,
            props: {
              ...group.data.props,
              columns,
              columnsCount: columns.length,
            },
          },
        },
      } as EmailDocument);
      selectNode(clone.rootId);
      return;
    }
    const index = parent.ids.indexOf(id);
    const ids = [...parent.ids];
    ids.splice(index + 1, 0, clone.rootId);
    commit(
      writeSlot({ ...document, ...clone.nodes } as EmailDocument, parent, ids),
    );
    selectNode(clone.rootId);
  };
  const duplicateSelected = () => {
    if (selectedId) duplicateById(selectedId);
  };
  const moveSelected = (offset: number) => {
    if (!selectedId || !editable) return;
    const parent = parentSlot(document, selectedId);
    if (!parent) return;
    const from = parent.ids.indexOf(selectedId);
    const to = Math.max(0, Math.min(parent.ids.length - 1, from + offset));
    if (from !== to)
      commit(writeSlot(document, parent, arrayMove(parent.ids, from, to)));
  };
  const dragStart = ({ active: dragged }: DragStartEvent) =>
    setActiveDragId(String(dragged.id));
  const dragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveDragId(null);
    if (!over || !editable) return;
    const draggedId = String(dragged.id);
    const overId = String(over.id);
    const parsed = parseDropId(overId);
    let destination: ChildSlot | undefined;
    let destinationIndex = 0;
    if (parsed) {
      destination = allSlots(document).find(
        (slot) => slot.ownerId === parsed.ownerId && slot.key === parsed.key,
      );
      destinationIndex = parsed.index;
    } else if (overId === "canvas-root") {
      destination = slotsOf(document, ROOT_ID)[0];
      destinationIndex = destination?.ids.length ?? 0;
    } else {
      // A block hit means "next to this block". Entering a row or column is
      // only possible through its explicit insertion rail.
      destination = parentSlot(document, overId);
      destinationIndex = Math.max(0, destination?.ids.indexOf(overId) ?? 0);
    }
    if (!destination) return;

    if (draggedId.startsWith("catalogue:")) {
      const fragment = createCatalogueFragment(
        draggedId.slice("catalogue:".length),
      );
      const ids = [...destination.ids];
      ids.splice(
        Math.min(destinationIndex, ids.length),
        0,
        ...fragment.rootIds,
      );
      const next = { ...document, ...fragment.nodes } as EmailDocument;
      commit(writeSlot(next, destination, ids));
      selectNode(fragment.rootIds[0] ?? ROOT_ID);
      return;
    }

    if (
      draggedId === overId ||
      descendants(document, draggedId).includes(destination.ownerId)
    )
      return;
    const source = parentSlot(document, draggedId);
    if (!source) return;
    const sameSlot =
      source.ownerId === destination.ownerId && source.key === destination.key;
    const sourceIndex = source.ids.indexOf(draggedId);
    let next = writeSlot(
      document,
      source,
      source.ids.filter((id) => id !== draggedId),
    );
    const refreshedDestination = allSlots(next).find(
      (slot) =>
        slot.ownerId === destination!.ownerId && slot.key === destination!.key,
    );
    if (!refreshedDestination) return;
    const ids = [...refreshedDestination.ids];
    const correctedIndex =
      sameSlot && sourceIndex < destinationIndex
        ? destinationIndex - 1
        : destinationIndex;
    ids.splice(Math.max(0, Math.min(correctedIndex, ids.length)), 0, draggedId);
    next = writeSlot(next, refreshedDestination, ids);
    commit(next);
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUploadAsset) return;
    try {
      const url = await onUploadAsset(file, mediaKind);
      if (mediaOpen) {
        chooseAsset({
          id: `uploaded-${Date.now()}`,
          name: file.name,
          url,
          fileType: file.type,
          scopeType: active.scopeType,
          assetKind: mediaKind,
          sourceType: "UPLOAD",
          editable: true,
        });
        return;
      }
      const fragment = createCatalogueFragment("image");
      const first = fragment.nodes[fragment.rootIds[0]];
      first.data.props = { ...first.data.props, url, alt: file.name };
      insertFragment(fragment);
    } catch (error) {
      setDiagnostics([
        error instanceof Error
          ? error.message
          : "The asset could not be uploaded to managed storage.",
      ]);
    }
  };
  const insertAsset = (
    url: string,
    name: string,
    kind: "IMAGE" | "ICON" = "IMAGE",
  ) => {
    const fragment = createCatalogueFragment("image");
    const first = fragment.nodes[fragment.rootIds[0]];
    first.data.props = {
      ...first.data.props,
      url,
      alt: name,
      width: kind === "ICON" ? 48 : first.data.props?.width,
    };
    if (kind === "ICON") {
      first.data.editorRole = "STANDALONE_ICON";
      first.data.editorSchemaVersion = 4;
      first.data.editorMetadata = {
        accessibilityLabel: name,
        action: { type: "NONE", href: "" },
      };
    }
    insertFragment(fragment);
  };
  const openMedia = (kind: "IMAGE" | "ICON" | "SVG") => {
    if (kind !== "SVG") setMediaKind(kind);
    setMediaTab(kind === "ICON" ? "icons" : kind === "SVG" ? "svg" : "library");
    setMediaOpen(true);
  };
  const chooseAsset = (asset: StudioAsset) => {
    if (selected?.type === "Image") {
      const role = editorRoleOf(selected);
      const choosingIcon = asset.assetKind === "ICON" || mediaKind === "ICON";
      const nextRole =
        choosingIcon && role !== "SOCIAL_ICON" ? "STANDALONE_ICON" : role;
      commit({
        ...document,
        [selectedId!]: {
          ...selected,
          data: {
            ...selected.data,
            editorRole: nextRole || selected.data.editorRole,
            editorSchemaVersion: choosingIcon
              ? 4
              : selected.data.editorSchemaVersion,
            editorMetadata: {
              ...((selected.data.editorMetadata as object | undefined) ?? {}),
              accessibilityLabel: asset.name,
              iconName: choosingIcon
                ? (asset.metadata?.iconName ?? asset.name)
                : (
                  selected.data.editorMetadata as
                  Record<string, unknown> | undefined
                )?.iconName,
              iconColor: choosingIcon
                ? (asset.metadata?.iconColor ??
                  (
                    selected.data.editorMetadata as
                    Record<string, unknown> | undefined
                  )?.iconColor ??
                  "#4f46e5")
                : (
                  selected.data.editorMetadata as
                  Record<string, unknown> | undefined
                )?.iconColor,
            },
            props: {
              ...selected.data.props,
              url: asset.url,
              alt: asset.name,
              width: choosingIcon
                ? Number(selected.data.props?.width ?? 48)
                : selected.data.props?.width,
            },
          },
        },
      } as EmailDocument);
    } else if (selected?.type === "Avatar")
      updateNode("props", { imageUrl: asset.url, alt: asset.name });
    else insertAsset(asset.url, asset.name, mediaKind);
    setMediaOpen(false);
  };
  const chooseLucideIcon = async (name: DynamicIconName, color = "#4f46e5") => {
    setIconLoading(name);
    try {
      const module = await dynamicIconImports[name]();
      const Icon = module.default;
      const host = window.document.createElement("div");
      const iconRoot = createRoot(host);
      iconRoot.render(<Icon size={96} strokeWidth={1.8} color={color} />);
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
      const svg = host.innerHTML;
      iconRoot.unmount();
      const blobUrl = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml" }),
      );
      const image = new window.Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Icon could not be rendered"));
        image.src = blobUrl;
      });
      const canvas = window.document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 192;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Icon canvas is unavailable");
      context.clearRect(0, 0, 192, 192);
      context.drawImage(image, 0, 0, 192, 192);
      URL.revokeObjectURL(blobUrl);
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Icon could not be rasterized")),
          "image/png",
        ),
      );
      const file = new File([png], `${name}.png`, { type: "image/png" });
      let url = canvas.toDataURL("image/png");
      let embeddedFallback = false;
      if (onUploadAsset) {
        try {
          url = await onUploadAsset(file, "ICON");
        } catch {
          embeddedFallback = true;
          setDiagnostics([
            "Managed asset storage is unavailable. The icon was embedded in this draft so you can continue editing; configure asset storage before publishing.",
          ]);
        }
      }
      chooseAsset({
        id: `lucide-${name}-${Date.now()}`,
        name,
        url,
        fileType: "image/png",
        scopeType: active.scopeType,
        assetKind: "ICON",
        sourceType: "BUILTIN_ICON",
        width: 192,
        height: 192,
        editable: true,
        metadata: {
          iconName: name,
          iconColor: color,
          ...(embeddedFallback ? { embeddedFallback: true } : {}),
        },
      });
    } catch (error) {
      setDiagnostics([
        error instanceof Error
          ? error.message
          : "The icon could not be saved to the asset library.",
      ]);
    } finally {
      setIconLoading(null);
    }
  };
  const recolorSelectedIcon = async (color: string) => {
    if (
      !selected ||
      selected.type !== "Image" ||
      !editorRoleOf(selected).includes("ICON")
    )
      return;
    const iconName = metadata.iconName;
    if (typeof iconName === "string" && iconName in dynamicIconImports) {
      await chooseLucideIcon(iconName as DynamicIconName, color);
      return;
    }

    const source = String(selected.data.props?.url ?? "");
    if (!source) return;
    setIconLoading(selectedId);
    try {
      const image = new window.Image();
      image.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(
            new Error(
              "This icon cannot be recolored until it is imported into the managed library.",
            ),
          );
        image.src = source;
      });
      const canvas = window.document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 192;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Icon canvas is unavailable");
      context.clearRect(0, 0, 192, 192);
      context.drawImage(image, 0, 0, 192, 192);
      context.globalCompositeOperation = "source-in";
      context.fillStyle = color;
      context.fillRect(0, 0, 192, 192);
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Icon could not be recolored")),
          "image/png",
        ),
      );
      const file = new File([png], `icon-${color.slice(1)}.png`, {
        type: "image/png",
      });
      let url = canvas.toDataURL("image/png");
      let embeddedFallback = false;
      if (onUploadAsset) {
        try {
          url = await onUploadAsset(file, "ICON");
        } catch {
          embeddedFallback = true;
          setDiagnostics([
            "Managed asset storage is unavailable. The recolored icon was embedded in this draft; configure asset storage before publishing.",
          ]);
        }
      }
      chooseAsset({
        id: `derived-icon-${Date.now()}`,
        name: String(selected.data.props?.alt ?? "Custom icon"),
        url,
        fileType: "image/png",
        scopeType: active.scopeType,
        assetKind: "ICON",
        sourceType: "DERIVED",
        width: 192,
        height: 192,
        editable: true,
        metadata: {
          iconColor: color,
          ...(embeddedFallback ? { embeddedFallback: true } : {}),
        },
      });
    } catch (error) {
      setDiagnostics([
        error instanceof Error ? error.message : "Icon could not be recolored.",
      ]);
    } finally {
      setIconLoading(null);
    }
  };
  const importMedia = async () => {
    if (!/^https:\/\//i.test(mediaUrl)) return;
    try {
      const asset = onImportAsset
        ? await onImportAsset(mediaUrl, mediaKind)
        : {
          id: `linked-${Date.now()}`,
          name:
            mediaUrl.split("/").at(-1)?.split("?")[0] ||
            (mediaKind === "ICON" ? "Linked icon" : "Linked image"),
          url: mediaUrl,
          fileType: "image/*",
          scopeType: active.scopeType,
          assetKind: mediaKind,
          sourceType: "URL_IMPORT" as const,
          editable: true,
        };
      chooseAsset(asset);
      setMediaUrl("");
    } catch (error) {
      setDiagnostics([
        error instanceof Error
          ? error.message
          : "The linked asset could not be imported.",
      ]);
    }
  };

  const runPreview = async () => {
    const draft = buildDraft();
    if (!draft) return;
    setServerPreviewHtml(null);
    if (onPreview) {
      try {
        const result = await onPreview(draft);
        setServerPreviewHtml(result.html);
        setDiagnostics(result.diagnostics.map((item) => item.message));
      } catch (error) {
        setDiagnostics([
          error instanceof Error ? error.message : "Preview validation failed.",
        ]);
      }
    }
    setPreviewOpen(true);
  };
  const runTest = async () => {
    const draft = buildDraft();
    if (!draft || !onSendTest || !recipient) return;
    await onSendTest(draft, recipient);
    setTestOpen(false);
    setRecipient("");
  };
  const runPublish = async () => {
    if (!active || !onPublish || reason.trim().length < 12) return;
    await onPublish(active, reason.trim());
    setPublishOpen(false);
    setReason("");
  };
  const openVersionHistory = async () => {
    if (!active || !onLoadVersions) return;
    const loaded = (await onLoadVersions(active)).filter(
      (item) => item.lifecycleState !== "DRAFT",
    );
    setVersions(loaded);
    setRollbackVersionId(loaded[0]?.id ?? "");
    setRollbackOpen(true);
  };
  const runRollback = async () => {
    if (
      !active ||
      !onRollback ||
      !rollbackVersionId ||
      rollbackReason.trim().length < 12
    )
      return;
    await onRollback(active, rollbackVersionId, rollbackReason.trim());
    setRollbackOpen(false);
    setRollbackReason("");
  };
  const runCreate = async () => {
    const stableKey = newTemplateKey.trim();
    if (
      !onCreateTemplate ||
      newTemplateName.trim().length < 2 ||
      !/^[a-z0-9][a-z0-9_-]{1,99}$/.test(stableKey)
    )
      return;
    await onCreateTemplate({ name: newTemplateName.trim(), stableKey });
    setCreateOpen(false);
    setNewTemplateName("");
    setNewTemplateKey("");
  };
  const saveFragment = async () => {
    if (!selectedId || !onSaveFragment || fragmentName.trim().length < 2)
      return;
    const fragment = cloneSubtree(document, selectedId);
    await onSaveFragment({
      name: fragmentName.trim(),
      componentKind: slotsOf(document, selectedId).length ? "SECTION" : "BLOCK",
      documentFragment: { nodes: fragment.nodes, rootIds: [fragment.rootId] },
    });
    setFragmentName("");
  };

  if (!active)
    return <div className="ebs-empty">No email templates are available.</div>;
  const grouped = (group: CatalogueItem["group"]) =>
    CATALOGUE.filter((item) => item.group === group);
  const root = nodeOf(document, ROOT_ID);
  const style = asStyle(selected);
  const props = asProps(selected);
  const capability = capabilityFor(selected);
  const editorRole = editorRoleOf(selected);
  const metadata =
    (selected?.data.editorMetadata as Record<string, unknown> | undefined) ??
    {};
  const rootSlot = slotsOf(document, ROOT_ID)[0];
  const activeDragLabel = activeDragId?.startsWith("catalogue:")
    ? CATALOGUE.find(
      (item) => item.key === activeDragId.slice("catalogue:".length),
    )?.label
    : activeDragId
      ? nodeOf(document, activeDragId)?.type
      : null;

  if (viewMode === "gallery") {
    return (
      <section className="ebs-shell" aria-label="Email templates gallery">
        <EmailTemplateGrid
          templates={templates}
          scopeLabel={scopeLabel}
          activeTemplateId={active?.id ?? null}
          onSelectTemplate={onSelectTemplate}
          onRequestCreateNew={onRequestCreateNew}
          onCreateTemplate={onCreateTemplate}
          onDeleteTemplate={onDeleteTemplate}
          onDuplicateTemplate={onDuplicateTemplate}
          onSendTest={(id) => {
            onSelectTemplate?.(id);
            setTestOpen(true);
            setViewMode("editor");
          }}
          onOpenEditor={(id) => {
            onSelectTemplate?.(id);
            setViewMode("editor");
          }}
          onOpenDetails={(id) => {
            onSelectTemplate?.(id);
            setViewMode("details");
          }}
        />
      </section>
    );
  }

  if (viewMode === "details" && active) {
    return (
      <section className="ebs-shell" aria-label="Email template details">
        <TemplateDetailsView
          template={active}
          scopeLabel={scopeLabel}
          organizations={organizations}
          onBackToGallery={() => setViewMode("gallery")}
          onOpenEditor={() => setViewMode("editor")}
          onSaveDraft={async (draft) => {
            setName(draft.name);
            setSubject(draft.subject);
            setPreheader(draft.preheader ?? "");
            if (onSaveDraft) {
              await onSaveDraft({
                ...draft,
                designerJson: draft.designerJson || document,
              });
            }
          }}
          onUpdateScope={onUpdateScope}
          onDuplicateTemplate={onDuplicateTemplate}
          onDeleteTemplate={onDeleteTemplate}
          onSendTest={(id) => {
            setTestOpen(true);
            setViewMode("editor");
          }}
          onLoadVersions={onLoadVersions}
          onRollback={onRollback}
        />
      </section>
    );
  }

  return (
    <section className="ebs-shell" aria-label="Email designer">
      <header className="ebs-toolbar">
        <button
          type="button"
          className="ebs-btn-back-gallery"
          title="Back to Projects"
          onClick={() => {
            if (onExit) onExit();
            else setViewMode("gallery");
          }}
        >
          <ArrowLeft size={16} />
          <span>All Templates</span>
        </button>
        <div className="ebs-brand-lockup">
          <span className="ebs-brand-icon">
            <Send size={17} />
          </span>
          <span>
            <strong>Email Designer</strong>
            <small>{scopeLabel}</small>
          </span>
        </div>
        <div className="ebs-template-title">
          <select
            aria-label="Active template"
            value={active.id}
            onChange={(event) => onSelectTemplate?.(event.target.value)}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <span>{active.effectiveOrigin ?? active.scopeType} default</span>
          {onRequestCreateNew || onCreateTemplate ? (
            <button
              className="ebs-new-template"
              type="button"
              onClick={() => onRequestCreateNew ? onRequestCreateNew() : setCreateOpen(true)}
            >
              <Plus size={14} />
              New default
            </button>
          ) : null}
          <small className={`is-${saveState}`}>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "dirty"
                ? "Unsaved changes"
                : saveState === "error"
                  ? "Save failed"
                  : "All changes saved"}
          </small>
        </div>
        <div className="ebs-device-toggle">
          <button
            aria-label="Desktop preview"
            className={screen === "desktop" ? "is-active" : ""}
            onClick={() => setScreen("desktop")}
          >
            <Monitor size={17} />
          </button>
          <button
            aria-label="Mobile preview"
            className={screen === "mobile" ? "is-active" : ""}
            onClick={() => setScreen("mobile")}
          >
            <Smartphone size={17} />
          </button>
        </div>
        <div className="ebs-toolbar-actions">
          <button
            title="Undo (Ctrl+Z)"
            disabled={!editable || !history.length}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            title="Redo (Ctrl+Shift+Z)"
            disabled={!editable || !future.length}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <button onClick={() => void runPreview()}>
            <Eye size={16} />
            Preview
          </button>
          <button disabled={!onSendTest} onClick={() => setTestOpen(true)}>
            <Send size={16} />
            Send test
          </button>
          <button disabled={!editable || busy} onClick={() => void save()}>
            <Save size={16} />
            Save draft
          </button>
          {onPublish ? (
            <div className="ebs-split-action">
              <button
                className="ebs-publish"
                disabled={!editable || busy || saveState !== "saved"}
                onClick={() => setPublishOpen(true)}
              >
                Publish
              </button>
              <button
                className="ebs-publish-menu"
                disabled={!editable || busy}
                onClick={() => setPublishMenu((value) => !value)}
                aria-label="More publish actions"
              >
                <ChevronDown size={15} />
              </button>
              {publishMenu ? (
                <div className="ebs-action-menu">
                  <button
                    onClick={() => {
                      setPublishMenu(false);
                      void openVersionHistory();
                    }}
                    disabled={!onRollback || !onLoadVersions}
                  >
                    Version history
                  </button>
                  <button
                    onClick={() => {
                      setPublishMenu(false);
                      void onArchive?.(active);
                    }}
                    disabled={!onArchive}
                  >
                    <Archive size={14} />
                    Archive
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      {!editable ? (
        <div className="ebs-plan-state">
          <strong>Platform default in use.</strong>
          <span>
            Your plan can preview and send this template, but cannot change it.
          </span>
        </div>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={preciseCollisionDetection}
        onDragStart={dragStart}
        onDragCancel={() => setActiveDragId(null)}
        onDragEnd={dragEnd}
      >

          <div className={`ebs-workspace ${activeDragId ? "is-dragging" : ""}`}>
            <nav className="ebs-toolrail" aria-label="Designer tools">
              {(
                [
                  ["components", Blocks, "Components"],
                  ["templates", FolderOpen, "Templates"],
                  ["structure", Layers3, "Structure"],
                  ["assets", ImageIcon, "Assets"],
                  ["brand", Palette, "Brand"],
                  ["document", Settings2, "Document"],
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  className={tool === key ? "is-active" : ""}
                  onClick={() => {
                    setTool(key);
                    setLeftOpen((open) => (tool === key ? !open : true));
                  }}
                  aria-label={label}
                  title={label}
                >
                  <Icon size={18} />
                </button>
              ))}
            </nav>
            <aside className={`ebs-left-panel ${leftOpen ? "is-open" : ""}`}>
              {tool === "components" ? (
                <>
                  <div className="ebs-tabs">
                    <button
                      className={catalogueTab === "blocks" ? "is-active" : ""}
                      onClick={() => setCatalogueTab("blocks")}
                    >
                      Content
                    </button>
                    <button
                      className={catalogueTab === "sections" ? "is-active" : ""}
                      onClick={() => setCatalogueTab("sections")}
                    >
                      Rows
                    </button>
                    <button
                      className={catalogueTab === "saved" ? "is-active" : ""}
                      onClick={() => setCatalogueTab("saved")}
                    >
                      Saved
                    </button>
                  </div>
                  <div className="ebs-catalogue-scroll">
                    {catalogueTab === "blocks" ? (
                      <>
                        {(
                          ["Basic", "Event components", "Content"] as const
                        ).map((group) => (
                          <section className="ebs-catalogue-group" key={group}>
                            <h3>{group}</h3>
                            <div className="ebs-catalogue-grid">
                              {grouped(group).map((item) => (
                                <CatalogueButton
                                  key={item.key}
                                  item={item}
                                  disabled={!editable}
                                  onInsert={() => addCatalogue(item)}
                                />
                              ))}
                            </div>
                          </section>
                        ))}
                      </>
                    ) : catalogueTab === "sections" ? (
                      <section className="ebs-catalogue-group">
                        <h3>Rows</h3>
                        <div className="ebs-row-list">
                          {grouped("Sections").map((item) => (
                            <CatalogueButton
                              key={item.key}
                              item={item}
                              disabled={!editable}
                              onInsert={() => addCatalogue(item)}
                            />
                          ))}
                        </div>
                      </section>
                    ) : (
                      <section className="ebs-saved-list">
                        <h3>Reusable blocks and rows</h3>
                        {fragments.map((fragment) => {
                          const saved = normalizeSavedFragment(
                            fragment.documentFragment,
                          );
                          return (
                            <button
                              key={fragment.id}
                              disabled={!editable || !saved}
                              onClick={() => {
                                if (saved) insertFragment(saved);
                              }}
                            >
                              <FileStack size={16} />
                              <span>
                                <strong>{fragment.name}</strong>
                                <small>
                                  {saved
                                    ? `${fragment.componentKind} · ${fragment.scopeType}`
                                    : "Legacy fragment · unavailable"}
                                </small>
                              </span>
                            </button>
                          );
                        })}
                        {!fragments.length ? (
                          <p>
                            No saved content yet. Select a block and save it
                            from Settings.
                          </p>
                        ) : null}
                      </section>
                    )}
                  </div>
                </>
              ) : null}
              {tool === "templates" ? (
                <div className="ebs-panel-content">
                  <h2>Template library</h2>
                  <p>{templates.length} available templates</p>
                  <div className="ebs-template-list">
                    {templates.map((template) => (
                      <button
                        className={template.id === active.id ? "is-active" : ""}
                        key={template.id}
                        onClick={() => onSelectTemplate?.(template.id)}
                      >
                        <span>{template.name.slice(0, 1)}</span>
                        <div>
                          <strong>{template.name}</strong>
                          <small>
                            {template.lifecycleState} · v{template.version}
                          </small>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {tool === "structure" ? (
                <div className="ebs-panel-content">
                  <h2>Message structure</h2>
                  <p>Drag blocks into rows or reorder them.</p>
                  <div className="ebs-tree">
                    {rootIds.map((id) => (
                      <TreeRow
                        key={id}
                        id={id}
                        document={document}
                        depth={0}
                        selectedId={selectedId}
                        onSelect={(id) => {
                          setSelectedId(id);
                          setInspectorOpen(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              {tool === "assets" ? (
                <div className="ebs-panel-content">
                  <h2>Asset library</h2>
                  <p>Use immutable email images.</p>
                  {onUploadAsset ? (
                    <button
                      className="ebs-upload"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload size={15} />
                      Upload image
                    </button>
                  ) : null}
                  <input
                    ref={fileRef}
                    hidden
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={(event) => void upload(event)}
                  />
                  <div className="ebs-assets">
                    {assets.map((asset) => (
                      <button
                        key={asset.id}
                        onClick={() => insertAsset(asset.url, asset.name)}
                      >
                        <img src={asset.url} alt="" />
                        <span>{asset.name}</span>
                      </button>
                    ))}
                  </div>
                  {!assets.length ? (
                    <p className="ebs-empty-note">
                      No managed assets in this scope.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {tool === "brand" ? (
                <div className="ebs-panel-content">
                  <h2>Email brand</h2>
                  <p>Document-wide visual defaults.</p>
                  <Field label="Canvas color">
                    <input
                      type="color"
                      value={String(root.data.canvasColor ?? "#ffffff")}
                      onChange={(event) =>
                        updateRoot({ canvasColor: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Backdrop color">
                    <input
                      type="color"
                      value={String(root.data.backdropColor ?? "#f0f1f3")}
                      onChange={(event) =>
                        updateRoot({ backdropColor: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Text color">
                    <input
                      type="color"
                      value={String(root.data.textColor ?? "#202124")}
                      onChange={(event) =>
                        updateRoot({ textColor: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Font family">
                    <select
                      value={String(root.data.fontFamily ?? "MODERN_SANS")}
                      onChange={(event) =>
                        updateRoot({ fontFamily: event.target.value })
                      }
                    >
                      {[
                        "MODERN_SANS",
                        "BOOK_SANS",
                        "GEOMETRIC_SANS",
                        "ROUNDED_SANS",
                        "MODERN_SERIF",
                        "BOOK_SERIF",
                        "MONOSPACE",
                      ].map((font) => (
                        <option key={font}>{font}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              ) : null}
              {tool === "document" ? (
                <div className="ebs-panel-content">
                  <h2>Document settings</h2>
                  <Field label="Template name">
                    <input
                      value={name}
                      disabled={!editable}
                      onChange={(event) => {
                        setName(event.target.value);
                        setSaveState("dirty");
                      }}
                    />
                  </Field>
                  <Field label="Subject">
                    <input
                      value={subject}
                      disabled={!editable}
                      onChange={(event) => {
                        setSubject(event.target.value);
                        setSaveState("dirty");
                      }}
                    />
                  </Field>
                  <Field label="Preheader">
                    <textarea
                      value={preheader}
                      disabled={!editable}
                      onChange={(event) => {
                        setPreheader(event.target.value);
                        setSaveState("dirty");
                      }}
                    />
                  </Field>
                  <Field label="Language">
                    <select defaultValue="en">
                      <option value="en">English</option>
                    </select>
                  </Field>
                  {onUpdateScope ? (
                    <Field label="Tenant scope assignment">
                      <select
                        value={active?.organizationId ? "ORGANIZATION" : "PLATFORM"}
                        onChange={async (e) => {
                          const nextType = e.target.value as "PLATFORM" | "ORGANIZATION";
                          if (nextType === "PLATFORM") {
                            await onUpdateScope(active.id, "PLATFORM", null);
                          } else {
                            const firstOrg = organizations[0]?.id ?? null;
                            await onUpdateScope(active.id, "ORGANIZATION", firstOrg);
                          }
                        }}
                      >
                        <option value="PLATFORM">All Tenants / Organizations (Platform Default)</option>
                        <option value="ORGANIZATION">Specific Organization Only</option>
                      </select>
                      {active?.organizationId || (organizations && organizations.length > 0) ? (
                        <div className="ebs-scope-org-picker">
                          <small className="ebs-field-sub">Select Target Organization:</small>
                          <SearchableOrgSelect
                            organizations={organizations}
                            value={active?.organizationId}
                            onChange={async (orgId) => {
                              await onUpdateScope(active.id, "ORGANIZATION", orgId);
                            }}
                          />
                        </div>
                      ) : null}
                    </Field>
                  ) : null}
                </div>
              ) : null}
            </aside>
            <main
              className="ebs-stage"
              style={{
                backgroundColor: String(root.data.backdropColor ?? "#f0f1f3"),
              }}
              onClick={() => selectNode(ROOT_ID)}
            >
              <div
                ref={setCanvasDropRef}
                className={`ebs-canvas is-${screen} ${canvasIsOver ? "is-drop-target" : ""}`}
              >
                <div
                  className={`ebs-editable-email ${selectedId === ROOT_ID ? "is-selected" : ""}`}
                  style={{
                    backgroundColor: String(root.data.canvasColor ?? "#ffffff"),
                    color: String(root.data.textColor ?? "#202124"),
                  }}
                  onClick={() => selectNode(ROOT_ID)}
                >
                  {rootSlot ? (
                    <SlotContent
                      slot={rootSlot}
                      document={document}
                      selectedId={selectedId}
                      editable={editable}
                      dragActive={Boolean(activeDragId)}
                      viewport={screen}
                      onSelect={selectNode}
                      onDuplicate={duplicateById}
                      onDelete={removeById}
                      onTextCommit={updateTextById}
                    />
                  ) : null}
                  {!rootIds.length && !activeDragId ? (
                    <div className="ebs-empty-canvas">
                      <Plus size={24} />
                      <strong>Start with content or a row</strong>
                      <span>Drag an item here from Content or Rows.</span>
                    </div>
                  ) : null}
                </div>
                {brandingPolicy.enabled ? (
                  <div className="ebs-locked-brand">
                    <span className="ebs-eventos-mark">E</span>
                    <span>{brandingPolicy.text}</span>
                    <BadgeCheck size={13} />
                    <small>Platform controlled</small>
                  </div>
                ) : null}
              </div>
            </main>
            <aside
              className="ebs-inspector is-open"
              data-sidebar-tab={sidebarTab}
            >
              <div className="ebs-tabs">
                <button
                  className={inspectorTab === "content" ? "is-active" : ""}
                  onClick={() => {
                    setInspectorTab("content");
                    setSidebarTab("content");
                    setSelectedId(null);
                  }}
                >
                  Content
                </button>
                <button
                  className={inspectorTab === "style" ? "is-active" : ""}
                  onClick={() => {
                    setInspectorTab("style");
                    setSidebarTab("rows");
                    setSelectedId(null);
                  }}
                >
                  Rows
                </button>
                <button
                  className={inspectorTab === "settings" ? "is-active" : ""}
                  onClick={() => {
                    setInspectorTab("settings");
                    setSidebarTab("style");
                    setSelectedId(ROOT_ID);
                  }}
                >
                  Style
                </button>
              </div>
              <div className="ebs-inspector-scroll">
                {!selected ? (
                  <>
                    {inspectorTab === "content" ? (
                      <>
                        {(
                          ["Basic", "Event components", "Content"] as const
                        ).map((group) => (
                          <section className="ebs-catalogue-group" key={group}>
                            <h3>{group}</h3>
                            <div className="ebs-catalogue-grid">
                              {grouped(group).map((item) => (
                                <CatalogueButton
                                  key={item.key}
                                  item={item}
                                  disabled={!editable}
                                  onInsert={() => addCatalogue(item)}
                                />
                              ))}
                            </div>
                          </section>
                        ))}
                        <section className="ebs-saved-list">
                          <h3>Saved</h3>
                          {fragments.map((fragment) => {
                            const saved = normalizeSavedFragment(
                              fragment.documentFragment,
                            );
                            return saved ? (
                              <button
                                key={fragment.id}
                                disabled={!editable}
                                onClick={() => insertFragment(saved)}
                              >
                                <FileStack size={16} />
                                <span>
                                  <strong>{fragment.name}</strong>
                                  <small>
                                    {fragment.componentKind} ·{" "}
                                    {fragment.scopeType}
                                  </small>
                                </span>
                              </button>
                            ) : null;
                          })}
                          {!fragments.some((fragment) =>
                            normalizeSavedFragment(fragment.documentFragment),
                          ) ? (
                            <p>No saved content yet.</p>
                          ) : null}
                        </section>
                      </>
                    ) : inspectorTab === "style" ? (
                      <section className="ebs-catalogue-group">
                        <h3>Rows and layouts</h3>
                        <div className="ebs-row-list">
                          {grouped("Sections").map((item) => (
                            <CatalogueButton
                              key={item.key}
                              item={item}
                              disabled={!editable}
                              onInsert={() => addCatalogue(item)}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="ebs-inspector-heading">
                      <span>
                        {selectedId === ROOT_ID ? "Canvas" : capability.label}
                      </span>
                      <small>
                        {selectedId === ROOT_ID
                          ? "Document"
                          : selectedId?.slice(-8)}
                      </small>
                    </div>
                    {selectedId === ROOT_ID ? (
                      <div className="ebs-control-stack">
                        {inspectorTab === "content" ||
                          selectedId !== ROOT_ID ? (
                          <>
                            <Field label="Template name">
                              <input
                                value={name}
                                disabled={!editable}
                                onChange={(event) => {
                                  setName(event.target.value);
                                  setSaveState("dirty");
                                }}
                              />
                            </Field>
                            <Field label="Subject">
                              <input
                                value={subject}
                                disabled={!editable}
                                onChange={(event) => {
                                  setSubject(event.target.value);
                                  setSaveState("dirty");
                                }}
                              />
                            </Field>
                            <Field label="Preheader">
                              <textarea
                                value={preheader}
                                disabled={!editable}
                                onChange={(event) => {
                                  setPreheader(event.target.value);
                                  setSaveState("dirty");
                                }}
                              />
                            </Field>
                          </>
                        ) : null}
                        {inspectorTab === "style" || selectedId !== ROOT_ID ? (
                          <>
                            <Field label="Email background">
                              <input
                                type="color"
                                value={String(
                                  root.data.canvasColor ?? "#ffffff",
                                )}
                                onChange={(event) =>
                                  updateRoot({
                                    canvasColor: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label="Workspace backdrop">
                              <input
                                type="color"
                                value={String(
                                  root.data.backdropColor ?? "#f0f1f3",
                                )}
                                onChange={(event) =>
                                  updateRoot({
                                    backdropColor: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label="Default text color">
                              <input
                                type="color"
                                value={String(root.data.textColor ?? "#202124")}
                                onChange={(event) =>
                                  updateRoot({ textColor: event.target.value })
                                }
                              />
                            </Field>
                            <Field label="Global font">
                              <select
                                value={String(
                                  root.data.fontFamily ?? "MODERN_SANS",
                                )}
                                onChange={(event) =>
                                  updateRoot({ fontFamily: event.target.value })
                                }
                              >
                                {[
                                  "MODERN_SANS",
                                  "BOOK_SANS",
                                  "GEOMETRIC_SANS",
                                  "ROUNDED_SANS",
                                  "MODERN_SERIF",
                                  "BOOK_SERIF",
                                  "MONOSPACE",
                                ].map((font) => (
                                  <option key={font}>{font}</option>
                                ))}
                              </select>
                            </Field>
                          </>
                        ) : null}
                        {inspectorTab === "settings" ||
                          selectedId !== ROOT_ID ? (
                          <>
                            <Field label="Template name">
                              <input
                                value={name}
                                disabled={!editable}
                                onChange={(event) => {
                                  setName(event.target.value);
                                  setSaveState("dirty");
                                }}
                              />
                            </Field>
                            <Field label="Subject">
                              <input
                                value={subject}
                                disabled={!editable}
                                onChange={(event) => {
                                  setSubject(event.target.value);
                                  setSaveState("dirty");
                                }}
                              />
                            </Field>
                            <Field label="Preheader">
                              <textarea
                                value={preheader}
                                disabled={!editable}
                                onChange={(event) => {
                                  setPreheader(event.target.value);
                                  setSaveState("dirty");
                                }}
                              />
                            </Field>
                            <Field label="Email background">
                              <input
                                type="color"
                                value={String(
                                  root.data.canvasColor ?? "#ffffff",
                                )}
                                onChange={(event) =>
                                  updateRoot({
                                    canvasColor: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label="Workspace backdrop">
                              <input
                                type="color"
                                value={String(
                                  root.data.backdropColor ?? "#f0f1f3",
                                )}
                                onChange={(event) =>
                                  updateRoot({
                                    backdropColor: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label="Default text color">
                              <input
                                type="color"
                                value={String(root.data.textColor ?? "#202124")}
                                onChange={(event) =>
                                  updateRoot({ textColor: event.target.value })
                                }
                              />
                            </Field>
                            <Field label="Content width">
                              <select defaultValue="600">
                                <option value="600">600px standard</option>
                                <option value="640">640px wide</option>
                              </select>
                            </Field>
                            <Field label="Language">
                              <select defaultValue="en">
                                <option value="en">English</option>
                              </select>
                            </Field>
                            <div className="ebs-branding-policy">
                              <BadgeCheck size={18} />
                              <div>
                                <strong>{brandingPolicy.text}</strong>
                                <span>
                                  {brandingPolicy.enabled
                                    ? "Locked platform footer enabled"
                                    : "Platform footer disabled"}
                                </span>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        {inspectorTab === "content" ||
                          selectedId !== ROOT_ID ? (
                          <div className="ebs-control-stack">
                            <div
                              className="ebs-section-title"
                              data-category="content"
                            >
                              Content
                            </div>
                            {["Text", "Heading", "Button"].includes(
                              selected.type,
                            ) ? (
                              <Field
                                label={
                                  selected.type === "Button"
                                    ? "Button label"
                                    : "Text"
                                }
                              >
                                <textarea
                                  value={String(props.text ?? "")}
                                  onChange={(event) =>
                                    updateNode("props", {
                                      text: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                            ) : null}
                            {selected.type === "Heading" ? (
                              <Field label="Heading level">
                                <select
                                  value={String(props.level ?? "h2")}
                                  onChange={(event) =>
                                    updateNode("props", {
                                      level: event.target.value,
                                    })
                                  }
                                >
                                  <option value="h1">H1</option>
                                  <option value="h2">H2</option>
                                  <option value="h3">H3</option>
                                </select>
                              </Field>
                            ) : null}
                            {editorRole === "SOCIAL_GROUP" ? (
                              <>
                                <div className="ebs-section-title">
                                  Social collection
                                </div>
                                <div className="ebs-social-items">
                                  {slotsOf(document, selectedId!)
                                    .flatMap((slot) => slot.ids)
                                    .map((childId, index) => {
                                      const child = nodeOf(document, childId);
                                      return (
                                        <button
                                          key={childId}
                                          type="button"
                                          onClick={() => selectNode(childId)}
                                        >
                                          <img
                                            src={String(
                                              child?.data.props?.url ?? "",
                                            )}
                                            alt=""
                                          />
                                          <span>
                                            {String(
                                              (
                                                child?.data.editorMetadata as
                                                | Record<string, unknown>
                                                | undefined
                                              )?.network ?? `Icon ${index + 1}`,
                                            )}
                                          </span>
                                          <ChevronRight size={14} />
                                        </button>
                                      );
                                    })}
                                </div>
                                <button
                                  type="button"
                                  className="ebs-secondary-action"
                                  disabled={
                                    slotsOf(document, selectedId!).length >= 12
                                  }
                                  onClick={addSocialIcon}
                                >
                                  <Plus size={14} />
                                  Add new icon
                                </button>
                                <Field label="Orientation">
                                  <div className="ebs-segmented">
                                    {["horizontal", "vertical"].map(
                                      (orientation) => (
                                        <button
                                          key={orientation}
                                          type="button"
                                          className={
                                            metadata.orientation ===
                                              orientation ||
                                              (!metadata.orientation &&
                                                orientation === "horizontal")
                                              ? "is-active"
                                              : ""
                                          }
                                          onClick={() =>
                                            updateMetadata({ orientation })
                                          }
                                        >
                                          {orientation}
                                        </button>
                                      ),
                                    )}
                                  </div>
                                </Field>
                                <Field label="Icon spacing">
                                  <input
                                    type="range"
                                    min="0"
                                    max="48"
                                    value={Number(props.columnsGap ?? 4)}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        columnsGap: Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                              </>
                            ) : null}
                            {editorRole === "SOCIAL_ICON" ? (
                              <div className="ebs-section-title">
                                Icon action
                              </div>
                            ) : null}
                            {editorRole === "MANAGED_LIST" ? (
                              <>
                                <div className="ebs-section-title">
                                  List items
                                </div>
                                <Field label="List type">
                                  <div className="ebs-segmented">
                                    {["unordered", "ordered"].map((type) => (
                                      <button
                                        type="button"
                                        key={type}
                                        className={
                                          (metadata.listType ?? "unordered") ===
                                            type
                                            ? "is-active"
                                            : ""
                                        }
                                        onClick={() =>
                                          updateMetadata({ listType: type })
                                        }
                                      >
                                        {type}
                                      </button>
                                    ))}
                                  </div>
                                </Field>
                                {(
                                  (metadata.items as string[] | undefined) ?? []
                                ).map((item, index, items) => (
                                  <div
                                    className="ebs-collection-row"
                                    key={index}
                                  >
                                    <input
                                      value={item}
                                      onChange={(event) =>
                                        updateMetadata({
                                          items: items.map(
                                            (value, itemIndex) =>
                                              itemIndex === index
                                                ? event.target.value
                                                : value,
                                          ),
                                        })
                                      }
                                    />
                                    <button
                                      type="button"
                                      aria-label="Delete list item"
                                      onClick={() =>
                                        updateMetadata({
                                          items: items.filter(
                                            (_, itemIndex) =>
                                              itemIndex !== index,
                                          ),
                                        })
                                      }
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="ebs-secondary-action"
                                  onClick={() =>
                                    updateMetadata({
                                      items: [
                                        ...((metadata.items as
                                          string[] | undefined) ?? []),
                                        "New item",
                                      ],
                                    })
                                  }
                                >
                                  <Plus size={14} />
                                  Add item
                                </button>
                                <Field label="Item spacing">
                                  <input
                                    type="range"
                                    min="0"
                                    max="40"
                                    value={Number(metadata.itemSpacing ?? 8)}
                                    onChange={(event) =>
                                      updateMetadata({
                                        itemSpacing: Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Indent">
                                  <input
                                    type="range"
                                    min="0"
                                    max="80"
                                    value={Number(metadata.indent ?? 24)}
                                    onChange={(event) =>
                                      updateMetadata({
                                        indent: Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                              </>
                            ) : null}
                            {editorRole === "MANAGED_TABLE"
                              ? (() => {
                                const table =
                                  (metadata.table as
                                    Record<string, unknown> | undefined) ??
                                  {};
                                const rows =
                                  (table.rows as string[][] | undefined) ??
                                  [];
                                const updateTable = (
                                  patch: Record<string, unknown>,
                                ) =>
                                  updateMetadata({
                                    table: { ...table, ...patch },
                                  });
                                return (
                                  <>
                                    <div className="ebs-section-title">
                                      Table layout
                                    </div>
                                    <div className="ebs-table-editor">
                                      {rows.map((row, rowIndex) => (
                                        <div key={rowIndex}>
                                          {row.map((cell, columnIndex) => (
                                            <input
                                              key={columnIndex}
                                              aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`}
                                              value={cell}
                                              onChange={(event) =>
                                                updateTable({
                                                  rows: rows.map(
                                                    (
                                                      currentRow,
                                                      currentRowIndex,
                                                    ) =>
                                                      currentRowIndex ===
                                                        rowIndex
                                                        ? currentRow.map(
                                                          (
                                                            value,
                                                            currentColumnIndex,
                                                          ) =>
                                                            currentColumnIndex ===
                                                              columnIndex
                                                              ? event.target
                                                                .value
                                                              : value,
                                                        )
                                                        : currentRow,
                                                  ),
                                                })
                                              }
                                            />
                                          ))}
                                        </div>
                                      ))}
                                    </div>
                                    <div className="ebs-move-actions">
                                      <button
                                        type="button"
                                        disabled={rows.length >= 20}
                                        onClick={() =>
                                          updateTable({
                                            rows: [
                                              ...rows,
                                              Array.from(
                                                {
                                                  length: Number(
                                                    table.columns ??
                                                    rows[0]?.length ??
                                                    1,
                                                  ),
                                                },
                                                () => "New cell",
                                              ),
                                            ],
                                          })
                                        }
                                      >
                                        Add row
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          (rows[0]?.length ?? 0) >= 10
                                        }
                                        onClick={() =>
                                          updateTable({
                                            columns:
                                              (rows[0]?.length ?? 0) + 1,
                                            rows: rows.map((row) => [
                                              ...row,
                                              "New cell",
                                            ]),
                                          })
                                        }
                                      >
                                        Add column
                                      </button>
                                    </div>
                                    <label className="ebs-check">
                                      <input
                                        type="checkbox"
                                        checked={table.headerRow !== false}
                                        onChange={(event) =>
                                          updateTable({
                                            headerRow: event.target.checked,
                                          })
                                        }
                                      />
                                      Header row
                                    </label>
                                    <label className="ebs-check">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(table.striped)}
                                        onChange={(event) =>
                                          updateTable({
                                            striped: event.target.checked,
                                          })
                                        }
                                      />
                                      Striped rows
                                    </label>
                                    <Field label="Cell padding">
                                      <input
                                        type="range"
                                        min="2"
                                        max="32"
                                        value={Number(
                                          table.cellPadding ?? 10,
                                        )}
                                        onChange={(event) =>
                                          updateTable({
                                            cellPadding: Number(
                                              event.target.value,
                                            ),
                                          })
                                        }
                                      />
                                    </Field>
                                  </>
                                );
                              })()
                              : null}
                            {["Text", "Heading"].includes(selected.type) ? (
                              <>
                                <div className="ebs-rich-toolbar">
                                  <button
                                    type="button"
                                    className={
                                      style.fontWeight === "bold"
                                        ? "is-active"
                                        : ""
                                    }
                                    title="Bold"
                                    onClick={() =>
                                      updateNode("style", {
                                        fontWeight:
                                          style.fontWeight === "bold"
                                            ? "normal"
                                            : "bold",
                                      })
                                    }
                                  >
                                    <Bold size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      style.fontStyle === "italic"
                                        ? "is-active"
                                        : ""
                                    }
                                    title="Italic"
                                    onClick={() =>
                                      updateNode("style", {
                                        fontStyle:
                                          style.fontStyle === "italic"
                                            ? "normal"
                                            : "italic",
                                      })
                                    }
                                  >
                                    <Italic size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      String(
                                        style.textDecoration ?? "",
                                      ).includes("underline")
                                        ? "is-active"
                                        : ""
                                    }
                                    title="Underline"
                                    onClick={() =>
                                      updateNode("style", {
                                        textDecoration: String(
                                          style.textDecoration ?? "",
                                        ).includes("underline")
                                          ? "none"
                                          : "underline",
                                      })
                                    }
                                  >
                                    <Underline size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      String(
                                        style.textDecoration ?? "",
                                      ).includes("line-through")
                                        ? "is-active"
                                        : ""
                                    }
                                    title="Strike"
                                    onClick={() =>
                                      updateNode("style", {
                                        textDecoration: String(
                                          style.textDecoration ?? "",
                                        ).includes("line-through")
                                          ? "none"
                                          : "line-through",
                                      })
                                    }
                                  >
                                    <Strikethrough size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Link"
                                    onClick={() =>
                                      updateMetadata({
                                        action: {
                                          type: "WEB",
                                          href: "https://",
                                        },
                                      })
                                    }
                                  >
                                    <Link2 size={14} />
                                  </button>
                                </div>
                                <p className="ebs-field-note">
                                  Click the text directly in the canvas to edit
                                  it.
                                </p>
                              </>
                            ) : null}
                            {selected.type === "Html" ? (
                              <Field label="Email-safe HTML">
                                <textarea
                                  className="is-code"
                                  value={String(props.contents ?? "")}
                                  onChange={(event) =>
                                    updateNode("props", {
                                      contents: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                            ) : null}
                            {selected.type === "Button" ? (
                              <>
                                <Field label="Action type">
                                  <select
                                    value={String(metadata.actionType ?? "WEB")}
                                    onChange={(event) =>
                                      updateMetadata({
                                        actionType: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="WEB">Open web page</option>
                                    <option value="EMAIL">Send email</option>
                                    <option value="PHONE">Call phone</option>
                                    <option value="SPECIAL">
                                      Special link
                                    </option>
                                    <option value="FILE">Managed file</option>
                                  </select>
                                </Field>
                                <Field label="Destination">
                                  <input
                                    value={String(props.url ?? "")}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        url: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                              </>
                            ) : null}
                            {selected.type === "Spacer" ? (
                              <Field label="Height">
                                <input
                                  type="range"
                                  min="4"
                                  max="240"
                                  value={Number(props.height ?? 28)}
                                  onChange={(event) =>
                                    updateNode("props", {
                                      height: Number(event.target.value),
                                    })
                                  }
                                />
                              </Field>
                            ) : null}
                            {selected.type === "Divider" ? (
                              <>
                                <Field label="Line style">
                                  <select
                                    value={String(props.lineStyle ?? "solid")}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        lineStyle: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="solid">Solid</option>
                                    <option value="dashed">Dashed</option>
                                    <option value="dotted">Dotted</option>
                                  </select>
                                </Field>
                                <Field label="Thickness">
                                  <input
                                    type="range"
                                    min="1"
                                    max="12"
                                    value={Number(props.lineHeight ?? 1)}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        lineHeight: Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Line color">
                                  <input
                                    type="color"
                                    value={String(props.lineColor ?? "#e7e9f2")}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        lineColor: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                              </>
                            ) : null}
                            {selected.type === "Image" && editorRole === "VIDEO" ? (
                              (() => {
                                const currentLink = String(props.linkHref ?? "");
                                const currentUrl = String(props.url ?? "");
                                const isCustom = metadata.customVideoThumbnail === true;
                                const isPlaceholder = currentUrl === "https://placehold.co/600x320/111827/ffffff/png?text=%E2%96%B6+PLAY+VIDEO" || currentUrl === "";

                                return (
                                  <>
                                    <div className="ebs-section-title">Video Settings</div>
                                    <Field label="Video URL">
                                      <input
                                        type="url"
                                        placeholder="https://youtube.com/..."
                                        value={currentLink}
                                        onChange={(event) => {
                                          const newLinkHref = event.target.value;
                                          if (!isCustom) {
                                            updateNode("props", { linkHref: newLinkHref, url: "https://placehold.co/600x320/111827/ffffff/png?text=%E2%96%B6+PLAY+VIDEO" });
                                            generateYouTubeThumbnailWithPlayButton(newLinkHref).then((dataUri) => {
                                              if (dataUri) {
                                                updateNode("props", { url: dataUri });
                                              }
                                            });
                                          } else {
                                            updateNode("props", { linkHref: newLinkHref });
                                          }
                                        }}
                                      />
                                    </Field>
                                    <label style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px", fontSize: "13px" }}>
                                      <input
                                        type="checkbox"
                                        checked={isCustom}
                                        onChange={(event) => {
                                          const custom = event.target.checked;
                                          updateMetadata({ customVideoThumbnail: custom });
                                          if (!custom) {
                                            updateNode("props", { url: "https://placehold.co/600x320/111827/ffffff/png?text=%E2%96%B6+PLAY+VIDEO" });
                                            generateYouTubeThumbnailWithPlayButton(currentLink).then((dataUri) => {
                                              if (dataUri) {
                                                updateNode("props", { url: dataUri });
                                              }
                                            });
                                          } else if (isPlaceholder) {
                                            updateNode("props", { url: "" });
                                          }
                                        }}
                                      />
                                      Custom preview image
                                    </label>
                                    {isCustom ? (
                                      <Field label="Preview Image URL">
                                        <input
                                          type="url"
                                          placeholder="https://..."
                                          value={currentUrl}
                                          onChange={(event) =>
                                            updateNode("props", { url: event.target.value })
                                          }
                                        />
                                      </Field>
                                    ) : null}
                                  </>
                                );
                              })()
                            ) : null}
                            {selected.type === "ColumnsContainer" &&
                              editorRole !== "SOCIAL_GROUP" ? (
                              <>
                                <div className="ebs-section-title">Columns</div>
                                <Field label="Column gap">
                                  <input
                                    type="range"
                                    min="0"
                                    max="48"
                                    value={Number(props.columnsGap ?? 16)}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        columnsGap: Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                                <label className="ebs-check">
                                  <input
                                    type="checkbox"
                                    checked={metadata.stackOnMobile !== false}
                                    onChange={(event) =>
                                      updateMetadata({
                                        stackOnMobile: event.target.checked,
                                      })
                                    }
                                  />
                                  Stack on mobile
                                </label>
                                <Field label="Vertical alignment">
                                  <select
                                    value={String(
                                      props.contentAlignment ?? "middle",
                                    )}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        contentAlignment: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="top">Top</option>
                                    <option value="middle">Middle</option>
                                    <option value="bottom">Bottom</option>
                                  </select>
                                </Field>
                              </>
                            ) : null}
                            {selected.type === "Image" && editorRole !== "VIDEO" ? (
                              <>
                                <button
                                  className="ebs-change-media"
                                  onClick={() =>
                                    openMedia(
                                      String(
                                        selected.data.editorRole ?? "",
                                      ).includes("ICON")
                                        ? "ICON"
                                        : "IMAGE",
                                    )
                                  }
                                >
                                  <ImageIcon size={16} />
                                  {editorRole === "SOCIAL_ICON"
                                    ? "Change icon"
                                    : "Library, upload or link"}
                                </button>
                                <Field label="Image URL">
                                  <input
                                    value={String(props.url ?? "")}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        url: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Alternative text">
                                  <input
                                    value={String(props.alt ?? "")}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        alt: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Image title">
                                  <input
                                    value={String(props.title ?? "")}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        title: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Link URL">
                                  <input
                                    value={String(props.linkHref ?? "")}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        linkHref: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Click action">
                                  <select
                                    value={String(
                                      (
                                        metadata.action as
                                        Record<string, unknown> | undefined
                                      )?.type ??
                                      (props.linkHref ? "WEB" : "NONE"),
                                    )}
                                    onChange={(event) =>
                                      updateMetadata({
                                        action: {
                                          ...((metadata.action as
                                            object | undefined) ?? {}),
                                          type: event.target.value,
                                          href: String(props.linkHref ?? ""),
                                        },
                                      })
                                    }
                                  >
                                    <option value="NONE">None</option>
                                    <option value="WEB">Open web page</option>
                                    <option value="EMAIL">Send email</option>
                                    <option value="PHONE">Call phone</option>
                                    <option value="SPECIAL">
                                      Special link
                                    </option>
                                    <option value="FILE">Managed file</option>
                                  </select>
                                </Field>
                              </>
                            ) : null}
                            {selected.type === "Avatar" ? (
                              <>
                                <button
                                  className="ebs-change-media"
                                  onClick={() => openMedia("IMAGE")}
                                >
                                  <ImageIcon size={16} />
                                  Library, upload or link
                                </button>
                                <Field label="Portrait URL">
                                  <input
                                    value={String(props.imageUrl ?? "")}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        imageUrl: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Alternative text">
                                  <input
                                    value={String(props.alt ?? "")}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        alt: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                              </>
                            ) : null}
                            <div className="ebs-variable-list">
                              <span>Insert variable</span>
                              {variables.map((variable) => (
                                <button
                                  key={variable.key}
                                  disabled={
                                    !editable ||
                                    !["Text", "Heading", "Button"].includes(
                                      selected.type,
                                    )
                                  }
                                  onClick={() =>
                                    updateNode("props", {
                                      text: `${String(props.text ?? "")}${variable.key}`,
                                    })
                                  }
                                >
                                  {variable.label}
                                  {variable.required ? " *" : ""}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {inspectorTab === "style" || selectedId !== ROOT_ID ? (
                          <div className="ebs-control-stack">
                            <div
                              className="ebs-section-title"
                              data-category="appearance"
                            >
                              Appearance
                            </div>
                            <Field label="Background">
                              <input
                                type="color"
                                value={String(
                                  style.backgroundColor ?? "#ffffff",
                                )}
                                onChange={(event) =>
                                  updateNode("style", {
                                    backgroundColor: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            {capability.supportsTypography ? (
                              <>
                                <div
                                  className="ebs-section-title"
                                  data-category="typography"
                                >
                                  Typography
                                </div>
                                <Field label="Text color">
                                  <input
                                    type="color"
                                    value={String(
                                      style.color ??
                                      root.data.textColor ??
                                      "#202124",
                                    )}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        color: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Font size">
                                  <input
                                    type="range"
                                    min="10"
                                    max="48"
                                    value={Number(
                                      style.fontSize ??
                                      (selected.type === "Heading" ? 24 : 16),
                                    )}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        fontSize: Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Font weight">
                                  <select
                                    value={String(style.fontWeight ?? "normal")}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        fontWeight: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="normal">Regular</option>
                                    <option value="500">Medium</option>
                                    <option value="600">Semibold</option>
                                    <option value="bold">Bold</option>
                                  </select>
                                </Field>
                                <Field label="Font family">
                                  <select
                                    value={String(
                                      style.fontFamily ?? "Arial, sans-serif",
                                    )}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        fontFamily: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="Arial, sans-serif">
                                      Arial
                                    </option>
                                    <option value="Helvetica, Arial, sans-serif">
                                      Helvetica
                                    </option>
                                    <option value="Georgia, serif">
                                      Georgia
                                    </option>
                                    <option value="Verdana, sans-serif">
                                      Verdana
                                    </option>
                                    <option value="'Trebuchet MS', sans-serif">
                                      Trebuchet
                                    </option>
                                  </select>
                                </Field>
                                <Field label="Line height">
                                  <input
                                    type="number"
                                    min="0.9"
                                    max="3"
                                    step="0.1"
                                    value={Number(style.lineHeight ?? 1.5)}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        lineHeight: Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Letter spacing">
                                  <input
                                    type="number"
                                    min="-2"
                                    max="12"
                                    step="0.25"
                                    value={Number(style.letterSpacing ?? 0)}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        letterSpacing: Number(
                                          event.target.value,
                                        ),
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Text direction">
                                  <div className="ebs-segmented">
                                    {["ltr", "rtl"].map((direction) => (
                                      <button
                                        key={direction}
                                        type="button"
                                        className={
                                          (style.direction ?? "ltr") ===
                                            direction
                                            ? "is-active"
                                            : ""
                                        }
                                        onClick={() =>
                                          updateNode("style", { direction })
                                        }
                                      >
                                        {direction.toUpperCase()}
                                      </button>
                                    ))}
                                  </div>
                                </Field>
                              </>
                            ) : null}
                            <div
                              className="ebs-section-title"
                              data-category="layout"
                            >
                              Layout
                            </div>
                            <Field label="Alignment">
                              <div className="ebs-segmented">
                                {["left", "center", "right"].map((align) => (
                                  <button
                                    key={align}
                                    className={
                                      style.textAlign === align
                                        ? "is-active"
                                        : ""
                                    }
                                    onClick={() =>
                                      updateNode("style", { textAlign: align })
                                    }
                                  >
                                    {align}
                                  </button>
                                ))}
                              </div>
                            </Field>
                            <div
                              className="ebs-section-title"
                              data-category="spacing"
                            >
                              Spacing
                            </div>
                            <div className="ebs-padding">
                              <span>Padding</span>
                              {(
                                ["top", "right", "bottom", "left"] as const
                              ).map((edge) => (
                                <Field key={edge} label={edge}>
                                  <input
                                    type="number"
                                    min="0"
                                    max="120"
                                    value={Number(
                                      (
                                        style.padding as
                                        Record<string, number> | undefined
                                      )?.[edge] ?? 14,
                                    )}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        padding: {
                                          ...((style.padding as
                                            object | undefined) ?? {}),
                                          [edge]: Number(event.target.value),
                                        },
                                      })
                                    }
                                  />
                                </Field>
                              ))}
                            </div>
                            {capability.supportsBorder ? (
                              <>
                                <div
                                  className="ebs-section-title"
                                  data-category="border"
                                >
                                  Border
                                </div>
                                <Field label="Border style">
                                  <select
                                    value={String(style.borderStyle ?? "solid")}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        borderStyle: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="none">None</option>
                                    <option value="solid">Solid</option>
                                    <option value="dashed">Dashed</option>
                                    <option value="dotted">Dotted</option>
                                  </select>
                                </Field>
                                <Field label="Border width">
                                  <input
                                    type="number"
                                    min="0"
                                    max="12"
                                    value={Number(style.borderWidth ?? 0)}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        borderWidth: Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Border color">
                                  <input
                                    type="color"
                                    value={String(
                                      style.borderColor ?? "#d8dce5",
                                    )}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        borderColor: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Corner radius">
                                  <input
                                    type="range"
                                    min="0"
                                    max="48"
                                    value={Number(style.borderRadius ?? 0)}
                                    onChange={(event) =>
                                      updateNode("style", {
                                        borderRadius: Number(
                                          event.target.value,
                                        ),
                                      })
                                    }
                                  />
                                </Field>
                              </>
                            ) : null}
                            <div
                              className="ebs-section-title"
                              data-category="responsive"
                            >
                              Responsive
                            </div>
                            <Field label="Mobile padding">
                              <div className="ebs-padding">
                                {(
                                  ["top", "right", "bottom", "left"] as const
                                ).map((edge) => {
                                  const responsive = (
                                    metadata.responsiveStyle as
                                    | Record<string, Record<string, unknown>>
                                    | undefined
                                  )?.mobile;
                                  const mobilePadding = responsive?.padding as
                                    Record<string, number> | undefined;
                                  return (
                                    <input
                                      key={edge}
                                      aria-label={`Mobile ${edge} padding`}
                                      type="number"
                                      min="0"
                                      max="120"
                                      value={Number(
                                        mobilePadding?.[edge] ??
                                        (
                                          style.padding as
                                          Record<string, number> | undefined
                                        )?.[edge] ??
                                        14,
                                      )}
                                      onChange={(event) =>
                                        updateResponsiveStyle("mobile", {
                                          padding: {
                                            ...(mobilePadding ?? {}),
                                            [edge]: Number(event.target.value),
                                          },
                                        })
                                      }
                                    />
                                  );
                                })}
                              </div>
                            </Field>
                            <div className="ebs-check-grid">
                              <label className="ebs-check">
                                <input
                                  type="checkbox"
                                  checked={metadata.hideDesktop !== true}
                                  onChange={(event) =>
                                    updateMetadata({
                                      hideDesktop: !event.target.checked,
                                    })
                                  }
                                />
                                Show on desktop
                              </label>
                              <label className="ebs-check">
                                <input
                                  type="checkbox"
                                  checked={metadata.hideMobile !== true}
                                  onChange={(event) =>
                                    updateMetadata({
                                      hideMobile: !event.target.checked,
                                    })
                                  }
                                />
                                Show on mobile
                              </label>
                            </div>
                            <div
                              className="ebs-section-title"
                              data-category="accessibility"
                            >
                              Accessibility
                            </div>
                            <Field label="Accessibility label">
                              <input
                                value={String(
                                  metadata.accessibilityLabel ??
                                  props.alt ??
                                  "",
                                )}
                                onChange={(event) =>
                                  updateMetadata({
                                    accessibilityLabel: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            {selected.type === "Button" ? (
                              <>
                                <Field label="Button color">
                                  <input
                                    type="color"
                                    value={String(
                                      props.buttonBackgroundColor ?? "#2f58bf",
                                    )}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        buttonBackgroundColor:
                                          event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Button style">
                                  <select
                                    value={String(
                                      props.buttonStyle ?? "rounded",
                                    )}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        buttonStyle: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="rectangle">Rectangle</option>
                                    <option value="rounded">Rounded</option>
                                    <option value="pill">Pill</option>
                                  </select>
                                </Field>
                                <label className="ebs-check">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(props.fullWidth)}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        fullWidth: event.target.checked,
                                      })
                                    }
                                  />
                                  Full width
                                </label>
                              </>
                            ) : null}
                            {selected.type === "Image" ? (
                              <>
                                {editorRole.includes("ICON") ? (
                                  <Field label="Icon color">
                                    <input
                                      type="color"
                                      value={String(
                                        metadata.iconColor ?? "#4f46e5",
                                      )}
                                      disabled={iconLoading !== null}
                                      onChange={(event) =>
                                        updateMetadata({
                                          iconColor: event.target.value,
                                        })
                                      }
                                      onBlur={(event) =>
                                        void recolorSelectedIcon(event.target.value)
                                      }
                                    />
                                  </Field>
                                ) : null}
                                <Field
                                  label={
                                    editorRole.includes("ICON")
                                      ? "Icon size"
                                      : "Image width"
                                  }
                                >
                                  <input
                                    type="range"
                                    min="20"
                                    max={
                                      editorRole.includes("ICON")
                                        ? "192"
                                        : "600"
                                    }
                                    value={Number(
                                      props.width ??
                                      (editorRole.includes("ICON")
                                        ? 48
                                        : 552),
                                    )}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        width: Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                              </>
                            ) : null}
                            {selected.type === "Avatar" ? (
                              <>
                                <Field label="Portrait size">
                                  <input
                                    type="range"
                                    min="40"
                                    max="180"
                                    value={Number(props.size ?? 84)}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        size: Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Portrait shape">
                                  <select
                                    value={String(props.shape ?? "circle")}
                                    onChange={(event) =>
                                      updateNode("props", {
                                        shape: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="circle">Circle</option>
                                    <option value="rounded">Rounded</option>
                                    <option value="square">Square</option>
                                  </select>
                                </Field>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                        {inspectorTab === "settings" ||
                          selectedId !== ROOT_ID ? (
                          <div className="ebs-control-stack">
                            <div
                              className="ebs-section-title"
                              data-category="actions"
                            >
                              Block actions
                            </div>
                            <div className="ebs-move-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  setStyleClipboard(structuredClone(style))
                                }
                              >
                                Copy style
                              </button>
                              <button
                                type="button"
                                disabled={!styleClipboard}
                                onClick={() =>
                                  styleClipboard &&
                                  updateNode(
                                    "style",
                                    structuredClone(styleClipboard),
                                  )
                                }
                              >
                                Paste style
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateNode("style", {
                                    padding: {
                                      top: 14,
                                      right: 24,
                                      bottom: 14,
                                      left: 24,
                                    },
                                    backgroundColor: "transparent",
                                    borderWidth: 0,
                                    borderRadius: 0,
                                    textAlign: "left",
                                  })
                                }
                              >
                                Reset style
                              </button>
                            </div>
                            <button
                              className="ebs-secondary-action"
                              onClick={duplicateSelected}
                            >
                              <Copy size={15} />
                              Duplicate block
                            </button>
                            <div className="ebs-move-actions">
                              <button onClick={() => moveSelected(-1)}>
                                Move up
                              </button>
                              <button onClick={() => moveSelected(1)}>
                                Move down
                              </button>
                            </div>
                            {onSaveFragment ? (
                              <>
                                <Field label="Saved fragment name">
                                  <input
                                    value={fragmentName}
                                    onChange={(event) =>
                                      setFragmentName(event.target.value)
                                    }
                                  />
                                </Field>
                                <button
                                  className="ebs-secondary-action"
                                  disabled={fragmentName.trim().length < 2}
                                  onClick={() => void saveFragment()}
                                >
                                  <FileStack size={15} />
                                  Save for reuse
                                </button>
                              </>
                            ) : null}
                            <button
                              className="ebs-danger"
                              onClick={removeSelected}
                            >
                              <Trash2 size={15} />
                              Remove block
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </div>
            </aside>
          </div>

        <DragOverlay
          dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}
        >
          {activeDragLabel ? (
            <div className="ebs-drag-overlay">
              <GripVertical size={15} />
              <span>{activeDragLabel}</span>
              <small>Release to place</small>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <footer className="ebs-statusbar">
        <div className="ebs-breadcrumb">
          {breadcrumb(document, selectedId).map((item, index, items) => (
            <span key={`${item}-${index}`}>
              {item}
              {index < items.length - 1 ? <ChevronRight size={12} /> : null}
            </span>
          ))}
        </div>
        <div>
          {diagnostics.length ? (
            <span className="ebs-diagnostic">{diagnostics[0]}</span>
          ) : (
            <span className="ebs-autosave">✓ Autosave enabled</span>
          )}
          <button onClick={() => setStructureOpen(true)}>
            <LayoutPanelLeft size={14} />
            Show structure
          </button>
        </div>
      </footer>
      {previewOpen ? (
        <Modal title="Email preview" wide onClose={() => setPreviewOpen(false)}>
          <div className="ebs-preview-modal">
            <iframe
              title="Full email preview"
              sandbox=""
              srcDoc={serverPreviewHtml ?? framedPreview}
            />
          </div>
        </Modal>
      ) : null}
      {testOpen ? (
        <Modal title="Send a test email" onClose={() => setTestOpen(false)}>
          <div className="ebs-dialog-body">
            <p>
              Send the current draft with representative event data. Publishing
              is not required.
            </p>
            <Field label="Recipient email">
              <input
                type="email"
                autoFocus
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <div className="ebs-dialog-actions">
              <button onClick={() => setTestOpen(false)}>Cancel</button>
              <button
                className="is-primary"
                disabled={!recipient || !onSendTest}
                onClick={() => void runTest()}
              >
                <Send size={15} />
                Send test
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {publishOpen ? (
        <Modal
          title="Publish platform template"
          onClose={() => setPublishOpen(false)}
        >
          <div className="ebs-dialog-body">
            <p>
              Publishing makes this immutable version available to its
              configured scope.
            </p>
            <Field label="Publication reason">
              <textarea
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why this version is ready (minimum 12 characters)"
              />
            </Field>
            <div className="ebs-dialog-actions">
              <button onClick={() => setPublishOpen(false)}>Cancel</button>
              <button
                className="is-primary"
                disabled={reason.trim().length < 12 || busy}
                onClick={() => void runPublish()}
              >
                <Sparkles size={15} />
                Publish
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {rollbackOpen ? (
        <Modal
          title="Version history and rollback"
          onClose={() => setRollbackOpen(false)}
        >
          <div className="ebs-dialog-body">
            <p>
              Restoring creates a new immutable publication; the selected
              historical version is preserved.
            </p>
            {versions.length ? (
              <>
                <Field label="Published version">
                  <select
                    value={rollbackVersionId}
                    onChange={(event) =>
                      setRollbackVersionId(event.target.value)
                    }
                  >
                    {versions.map((item) => (
                      <option key={item.id} value={item.id}>
                        Version {item.version}
                        {item.publishedAt
                          ? ` · ${new Date(item.publishedAt).toLocaleString()}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Rollback reason">
                  <textarea
                    value={rollbackReason}
                    onChange={(event) => setRollbackReason(event.target.value)}
                    placeholder="Explain why this version should be restored"
                  />
                </Field>
              </>
            ) : (
              <p>No earlier published version is available.</p>
            )}
            <div className="ebs-dialog-actions">
              <button onClick={() => setRollbackOpen(false)}>Cancel</button>
              <button
                className="is-primary"
                disabled={
                  !rollbackVersionId ||
                  rollbackReason.trim().length < 12 ||
                  busy
                }
                onClick={() => void runRollback()}
              >
                Restore version
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {createOpen ? (
        <Modal
          title="New platform default"
          onClose={() => setCreateOpen(false)}
        >
          <div className="ebs-dialog-body">
            <p>
              Create a new email directly in the designer. It starts as a
              private draft.
            </p>
            <Field label="Template name">
              <input
                autoFocus
                value={newTemplateName}
                onChange={(event) => {
                  const value = event.target.value;
                  setNewTemplateName(value);
                  if (!newTemplateKey)
                    setNewTemplateKey(
                      value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    );
                }}
                placeholder="Registration confirmation"
              />
            </Field>
            <Field label="Stable key">
              <input
                value={newTemplateKey}
                onChange={(event) =>
                  setNewTemplateKey(
                    event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]+/g, "-"),
                  )
                }
                placeholder="registration-confirmation"
              />
            </Field>
            <div className="ebs-dialog-actions">
              <button onClick={() => setCreateOpen(false)}>Cancel</button>
              <button
                className="is-primary"
                disabled={
                  busy ||
                  newTemplateName.trim().length < 2 ||
                  !/^[a-z0-9][a-z0-9_-]{1,99}$/.test(newTemplateKey)
                }
                onClick={() => void runCreate()}
              >
                <Plus size={15} />
                Create draft
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {structureOpen ? (
        <Modal
          title="Message structure"
          onClose={() => setStructureOpen(false)}
        >
          <div className="ebs-dialog-body">
            <div className="ebs-tree">
              {rootIds.map((id) => (
                <TreeRow
                  key={id}
                  id={id}
                  document={document}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={(next) => {
                    selectNode(next);
                    setStructureOpen(false);
                  }}
                />
              ))}
            </div>
          </div>
        </Modal>
      ) : null}
      {mediaOpen ? (
        <Modal
          title={mediaKind === "ICON" ? "Choose an icon" : "Choose an image"}
          wide
          onClose={() => setMediaOpen(false)}
        >
          <div className="ebs-media-picker">
            <div className="ebs-media-tabs">
              <button
                className={mediaTab === "upload" ? "is-active" : ""}
                onClick={() => setMediaTab("upload")}
              >
                Upload file
              </button>
              <button
                className={mediaTab === "library" ? "is-active" : ""}
                onClick={() => setMediaTab("library")}
              >
                Image library
              </button>
              <button
                className={mediaTab === "svg" ? "is-active" : ""}
                onClick={() => setMediaTab("svg")}
              >
                Illustrations
              </button>
              <button
                className={mediaTab === "icons" ? "is-active" : ""}
                onClick={() => setMediaTab("icons")}
              >
                Icons
              </button>
            </div>
            {mediaTab === "library" ? (
              <>
                <label className="ebs-media-search">
                  <Search size={15} />
                  <input
                    value={mediaSearch}
                    onChange={(event) => setMediaSearch(event.target.value)}
                    placeholder="Search your managed library"
                  />
                </label>
                <div className="ebs-filter-chips ebs-scope-filters">
                  {["ALL", "PLATFORM", "ORGANIZATION", "EVENT"].map((scope) => (
                    <button
                      key={scope}
                      className={assetScope === scope ? "is-active" : ""}
                      onClick={() => setAssetScope(scope)}
                    >
                      {scope === "ALL" ? "All assets" : scope.toLowerCase()}
                      <span>
                        {
                          managedImageAssets.filter(
                            (asset) =>
                              scope === "ALL" || asset.scopeType === scope,
                          ).length
                        }
                      </span>
                    </button>
                  ))}
                  {onUploadAsset ? (
                    <button
                      className="is-action"
                      onClick={() => setMediaTab("upload")}
                    >
                      <Upload size={12} />
                      Upload new
                    </button>
                  ) : null}
                </div>
                <div className="ebs-media-grid">
                  {managedImageAssets
                    .filter(
                      (asset) =>
                        (assetScope === "ALL" ||
                          asset.scopeType === assetScope) &&
                        asset.name
                          .toLowerCase()
                          .includes(mediaSearch.toLowerCase()),
                    )
                    .map((asset) => (
                      <button key={asset.id} onClick={() => chooseAsset(asset)}>
                        <img src={asset.url} alt="" />
                        <span>{asset.name}</span>
                        <small>{asset.scopeType}</small>
                      </button>
                    ))}
                </div>
                {!managedImageAssets.length ? (
                  <div className="ebs-media-empty">
                    <ImageIcon size={28} />
                    <strong>Your library is ready for its first asset</strong>
                    <span>Upload a file or import one from an HTTPS link.</span>
                  </div>
                ) : null}
              </>
            ) : null}
            {mediaTab === "icons" ? (
              <div className="ebs-icon-browser">
                <label className="ebs-media-search">
                  <Search size={15} />
                  <input
                    value={iconSearch}
                    onChange={(event) => setIconSearch(event.target.value)}
                    placeholder="Search 1,500+ icons"
                  />
                </label>
                <div className="ebs-filter-chips ebs-scope-filters">
                  {["ALL", "PLATFORM", "ORGANIZATION", "EVENT"].map(
                    (scope) => (
                      <button
                        key={scope}
                        className={assetScope === scope ? "is-active" : ""}
                        onClick={() => setAssetScope(scope)}
                      >
                        {scope === "ALL" ? "All saved" : scope.toLowerCase()}
                        <span>
                          {
                            managedIconAssets.filter(
                              (asset) =>
                                scope === "ALL" || asset.scopeType === scope,
                            ).length
                          }
                        </span>
                      </button>
                    ),
                  )}
                  {onUploadAsset ? (
                    <button
                      className="is-action"
                      onClick={() => setMediaTab("upload")}
                    >
                      <Upload size={12} />
                      Upload icon
                    </button>
                  ) : null}
                </div>
                {visibleSavedIcons.length ? (
                  <>
                    <h3>Saved icons</h3>
                    <div className="ebs-icon-library is-saved">
                      {visibleSavedIcons.map((asset) => (
                        <button
                          key={asset.id}
                          title={`Use ${asset.name}`}
                          onClick={() =>
                            chooseAsset({ ...asset, assetKind: "ICON" })
                          }
                        >
                          <span>
                            <img src={asset.url} alt="" />
                          </span>
                          <small>{asset.name}</small>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <div className="ebs-filter-chips">
                  {Object.keys(ICON_CATEGORIES).map((category) => (
                    <button
                      key={category}
                      className={iconCategory === category ? "is-active" : ""}
                      onClick={() => setIconCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                {!iconSearch && iconCategory === "All" ? (
                  <>
                    <h3>Brand and social</h3>
                    <div className="ebs-icon-library is-brands">
                      {BRAND_ICONS.map(([key, label, iconName]) => (
                        <button
                          key={key}
                          disabled={iconLoading !== null}
                          onClick={() => void chooseLucideIcon(iconName)}
                        >
                          <span>
                            <LibraryIcon name={iconName} />
                          </span>
                          <small>{label}</small>
                          {iconLoading === iconName ? <em>Adding…</em> : null}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <h3>
                  {iconCategory === "All"
                    ? "All interface icons"
                    : iconCategory}
                </h3>
                <div className="ebs-icon-library">
                  {(Object.keys(dynamicIconImports) as DynamicIconName[])
                    .filter((name) => {
                      const query = iconSearch.trim().toLowerCase();
                      const matchesSearch = !query || name.includes(query);
                      const words = ICON_CATEGORIES[iconCategory] ?? [];
                      return (
                        matchesSearch &&
                        (!words.length ||
                          words.some((word) => name.includes(word)))
                      );
                    })
                    .slice(0, 180)
                    .map((name) => (
                      <button
                        key={name}
                        disabled={iconLoading !== null}
                        onClick={() => void chooseLucideIcon(name)}
                      >
                        <span>
                          <LibraryIcon name={name} />
                        </span>
                        <small>{name.replaceAll("-", " ")}</small>
                        {iconLoading === name ? <em>Adding…</em> : null}
                      </button>
                    ))}
                </div>
                <p className="ebs-library-count">
                  Search refines the complete Lucide catalogue. Up to 180
                  matching icons are shown at once for smooth scrolling.
                </p>
              </div>
            ) : null}
            {mediaTab === "svg" ? (
              <div style={{ height: "500px", padding: "16px 0" }}>
                <SvgGallery
                  onInsert={(url, title) => {
                    if (
                      selected &&
                      (editorRoleOf(selected) === "IMAGE" ||
                        editorRoleOf(selected) === "STANDALONE_ICON")
                    ) {
                      updateNode("props", { url, alt: title });
                    } else {
                      insertAsset(url, title, "IMAGE");
                    }
                    setMediaOpen(false);
                  }}
                />
              </div>
            ) : null}
            {mediaTab === "upload" ? (
              <div className="ebs-upload-drop">
                <Upload size={28} />
                <strong>
                  Upload {mediaKind === "ICON" ? "an icon" : "an image"}
                </strong>
                <span>PNG, JPEG, GIF or WebP · maximum 5 MB</span>
                <button onClick={() => fileRef.current?.click()}>
                  Choose file
                </button>
                <input
                  ref={fileRef}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={(event) => void upload(event)}
                />
              </div>
            ) : null}
            {mediaTab === "link" ? (
              <div className="ebs-link-import">
                <Link2 size={25} />
                <strong>Import from an HTTPS link</strong>
                <Field label="Image or icon URL">
                  <input
                    value={mediaUrl}
                    onChange={(event) => setMediaUrl(event.target.value)}
                    placeholder="https://example.com/image.png"
                  />
                </Field>
                <button
                  disabled={!/^https:\/\//i.test(mediaUrl)}
                  onClick={() => void importMedia()}
                >
                  Import to library
                </button>
                {!onImportAsset ? (
                  <span>URL import is not available for this scope yet.</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
