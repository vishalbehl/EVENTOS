import type {
  AssetReference,
  ComponentInstance,
  DesignTokens,
  PageConfig,
  ResponsiveDevice,
  ResponsiveStyleMap,
  SiteSettings,
  WebsiteDocument,
  WebsiteProjectData,
} from '../types';
import { BUILDER_COMPONENT_TYPES } from './components/typeRegistry';

export const WEBSITE_DOCUMENT_SCHEMA_VERSION = 1;
const INSTANCE_ID_ATTR = 'data-wb-instance-id';

type GrapesComponent = Record<string, unknown>;

function defaultStarterComponents(siteName = 'Your Event Name'): GrapesComponent[] {
  return [
    {
      type: 'hero',
      tagName: 'section',
      attributes: {
        'data-gjs-type': 'hero',
        'data-event-name': siteName,
        'data-tagline': 'Drag and drop components from the library to build your event website.',
      },
      style: {
        position: 'relative',
        'min-height': '85vh',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        background: 'linear-gradient(135deg, var(--background) 0%, var(--surface, var(--background)) 100%)',
        color: 'var(--foreground)',
        padding: '80px 24px',
        'text-align': 'center',
        overflow: 'hidden',
        'box-sizing': 'border-box',
      },
      components: [
        {
          tagName: 'div',
          style: {
            position: 'relative',
            'max-width': '900px',
            margin: '0 auto',
          },
          components: [
            {
              type: 'subheading',
              tagName: 'div',
              attributes: { 'data-gjs-type': 'subheading' },
              style: {
                display: 'inline-flex',
                'align-items': 'center',
                gap: '8px',
                background: 'var(--border-subtle, rgba(255,255,255,0.08))',
                border: '1px solid var(--border)',
                padding: '8px 18px',
                'border-radius': '999px',
                'font-size': '14px',
                'font-weight': '700',
                color: 'var(--primary)',
                'margin-bottom': '24px',
              },
              components: 'Website Builder',
            },
            {
              type: 'heading',
              tagName: 'h1',
              attributes: { 'data-gjs-type': 'heading', 'data-role': 'event-name' },
              style: {
                'font-size': 'clamp(36px, 6vw, 64px)',
                'font-weight': '900',
                'line-height': '1.1',
                margin: '0 0 20px 0',
                'letter-spacing': '-0.02em',
                color: 'var(--foreground)',
              },
              components: siteName,
            },
            {
              type: 'paragraph',
              tagName: 'p',
              attributes: { 'data-gjs-type': 'paragraph', 'data-role': 'tagline' },
              style: {
                'font-size': '20px',
                color: 'var(--muted-foreground)',
                'max-width': '680px',
                margin: '0 auto 36px auto',
                'line-height': '1.65',
              },
              components: 'Drag and drop section blocks from the left sidebar to build your custom event landing page.',
            },
            {
              type: 'button',
              tagName: 'a',
              attributes: { 'data-gjs-type': 'button', href: '#register' },
              style: {
                background: 'var(--primary)',
                color: 'var(--text-on-primary, #fff)',
                padding: '16px 36px',
                'border-radius': '12px',
                'font-weight': '800',
                'text-decoration': 'none',
                display: 'inline-block',
              },
              components: 'Register Now',
            },
          ],
        },
      ],
    },
  ];
}

function fallbackId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function stableStringify(value: unknown, seen = new WeakSet<object>()): string {
  if (Array.isArray(value)) {
    if (seen.has(value)) return '"[Circular]"';
    seen.add(value);
    const result = `[${value.map(child => stableStringify(child, seen)).join(',')}]`;
    seen.delete(value);
    return result;
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '"[Circular]"';
    seen.add(value);
    const result = `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .filter(([, child]) => typeof child !== 'function' && typeof child !== 'undefined')
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child, seen)}`)
      .join(',')}}`;
    seen.delete(value);
    return result;
  }
  return JSON.stringify(value);
}

export function checksumWebsiteDocument(document: Omit<WebsiteDocument, 'checksum'>): string {
  const payload = stableStringify(document);
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asComponentArray(value: unknown): GrapesComponent[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(toPlainGrapesComponent)
      .filter((component): component is GrapesComponent => Boolean(component));
  }
  const component = toPlainGrapesComponent(value);
  if (component) return [component];
  return [];
}

function toPlainGrapesComponent(value: unknown): GrapesComponent | null {
  if (typeof value === 'string' || typeof value === 'number') {
    return {
      type: 'textnode',
      content: String(value),
    };
  }

  if (!isRecord(value)) return null;

  const maybeToJson = value.toJSON;
  if (typeof maybeToJson === 'function') {
    try {
      const json = maybeToJson.call(value);
      if (isRecord(json)) return json as GrapesComponent;
    } catch {
      return null;
    }
  }

  return value as GrapesComponent;
}

function sanitizeJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const result = value
      .map(child => sanitizeJsonValue(child, seen))
      .filter(child => typeof child !== 'undefined');
    seen.delete(value);
    return result;
  }

  if (isRecord(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);

    const result: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, child]) => {
      const sanitized = sanitizeJsonValue(child, seen);
      if (typeof sanitized !== 'undefined') result[key] = sanitized;
    });
    seen.delete(value);
    return result;
  }

  return String(value);
}

function extractAttributes(component: GrapesComponent): Record<string, unknown> {
  const attributes = component.attributes;
  const sanitized = sanitizeJsonValue(attributes);
  return isRecord(sanitized) ? sanitized : {};
}

function extractStyles(component: GrapesComponent): ResponsiveStyleMap {
  const style = component.style;
  const sanitized = sanitizeJsonValue(style);
  return isRecord(sanitized) ? { desktop: Object.fromEntries(Object.entries(sanitized).map(([key, value]) => [key, String(value)])) } : {};
}

function inferComponentType(component: GrapesComponent): string {
  const explicitType = component.type;
  if (typeof explicitType === 'string' && explicitType) return explicitType;

  const tagName = typeof component.tagName === 'string' ? component.tagName.toLowerCase() : '';
  if (/^h[1-6]$/.test(tagName)) return 'heading';
  if (tagName === 'p') return 'paragraph';
  if (tagName === 'img') return 'image';
  if (tagName === 'footer') return 'footer';
  if (tagName === 'nav') return 'navigation';
  if (tagName === 'form') return 'contact-form';
  if (tagName === 'a' || tagName === 'button') return 'button';
  return tagName || 'default';
}

function extractProps(component: GrapesComponent): Record<string, unknown> {
  const props: Record<string, unknown> = {
    tagName: component.tagName,
    attributes: extractAttributes(component),
  };

  if (typeof component.content === 'string') props.content = component.content;
  if (typeof component.components === 'string') props.html = component.components;
  if (typeof component.text === 'string') props.content = component.text;

  Object.keys(props).forEach(key => {
    if (props[key] === undefined) delete props[key];
    else props[key] = sanitizeJsonValue(props[key]);
  });
  return props;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeHtmlTagName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const tagName = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]*$/.test(tagName) ? tagName : undefined;
}

function sanitizeGrapesTagNames(component: GrapesComponent): GrapesComponent {
  const next = component;
  const tagName = safeHtmlTagName(next.tagName);
  if (tagName) next.tagName = tagName;
  else delete next.tagName;
  if (Array.isArray(next.components)) {
    next.components = next.components
      .filter((child): child is GrapesComponent => Boolean(child) && typeof child === 'object' && !Array.isArray(child))
      .map(child => sanitizeGrapesTagNames(child));
  }
  return next;
}

export function instanceToGrapesComponent(instance: ComponentInstance, document: WebsiteDocument, device: ResponsiveDevice = 'desktop'): GrapesComponent {
  const adapter = instance.props.adapter;
  if (isRecord(adapter) && isRecord(adapter.grapesjs)) {
    const component = sanitizeGrapesTagNames(cloneJson(adapter.grapesjs as GrapesComponent));
    const attributes = isRecord(component.attributes) ? component.attributes : {};
    component.attributes = { ...attributes, [INSTANCE_ID_ATTR]: instance.id };
    return component;
  }

  const attributes = {
    ...(isRecord(instance.props.attributes) ? instance.props.attributes : {}),
    [INSTANCE_ID_ATTR]: instance.id,
  };
  const desktopStyles = {
    ...(instance.styles.desktop || {}),
    ...(device === 'desktop' ? {} : instance.styles[device] || {}),
  };
  const children = instance.children
    .map(childId => document.instances[childId])
    .filter(Boolean)
    .map(child => instanceToGrapesComponent(child, document, device));
  // Semantic HTML tags such as `span` are stored as component types in legacy
  // documents, but only registered builder types may be passed to GrapesJS.
  const componentType = instance.componentType === 'page-root' || !BUILDER_COMPONENT_TYPES.includes(instance.componentType as never)
    ? 'default'
    : instance.componentType;
  const component: GrapesComponent = {
    type: componentType,
    tagName: safeHtmlTagName(instance.props.tagName),
    attributes,
    style: desktopStyles,
    components: children,
  };
  if (children.length === 0) {
    if (typeof instance.props.content === 'string') component.content = instance.props.content;
    if (typeof instance.props.html === 'string') component.components = instance.props.html;
  }
  Object.keys(component).forEach(key => component[key] === undefined && delete component[key]);
  return component;
}

export function websiteDocumentPageToGrapesComponents(document: WebsiteDocument, pageId: string, device: ResponsiveDevice = 'desktop'): GrapesComponent[] {
  const page = document.pages.find(candidate => candidate.id === pageId) || document.pages.find(candidate => candidate.isHomePage) || document.pages[0];
  if (!page) return [];
  const root = document.instances[page.rootInstanceId];
  if (!root) return [];
  return root.children
    .map(childId => document.instances[childId])
    .filter(Boolean)
    .map(child => instanceToGrapesComponent(child, document, device));
}

function componentId(component: GrapesComponent, pageId: string, path: string): string {
  const attributes = extractAttributes(component);
  const existing = attributes[INSTANCE_ID_ATTR] || component[INSTANCE_ID_ATTR] || attributes.id;
  if (typeof existing === 'string' && existing) return existing;
  return `inst_${pageId}_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

function addInstanceTree(
  components: GrapesComponent[],
  instances: Record<string, ComponentInstance>,
  pageId: string,
  parentId: string,
  parentPath: string,
): string[] {
  return components.map((component, index) => {
    const path = `${parentPath}_${index}`;
    const id = componentId(component, pageId, path);
    const children = addInstanceTree(asComponentArray(component.components), instances, pageId, id, path);

    instances[id] = {
      id,
      componentType: inferComponentType(component),
      componentVersion: 1,
      parentId,
      children,
      props: extractProps(component),
      styles: extractStyles(component),
      bindings: [],
      states: {},
    };
    return id;
  });
}

export function buildWebsiteDocumentFromProject(project: WebsiteProjectData): WebsiteDocument {
  const now = project.updatedAt || new Date().toISOString();
  const hasLegacyContent = Boolean(project.components || project.html);
  const pages = project.pages?.length
    ? project.pages.map(page => {
        const hasPageContent = Boolean(page.components || page.html);
        return {
          ...page,
          components: page.components || (hasPageContent ? undefined : defaultStarterComponents(project.name || page.name || project.siteSettings?.siteName || 'Your Event Name')),
        };
      })
    : [{
        id: 'page_home',
        name: project.name || project.siteSettings?.siteName || 'Home',
        slug: '',
        isHomePage: true,
        html: project.html || '',
        css: project.css || '',
        components: project.components || (hasLegacyContent ? undefined : defaultStarterComponents(project.name || project.siteSettings?.siteName || 'Your Event Name')),
        styles: project.styles,
        createdAt: now,
        updatedAt: now,
      } satisfies PageConfig];

  const instances: Record<string, ComponentInstance> = {};
  const documentPages = pages.map(page => {
    const rootInstanceId = page.rootInstanceId || `root_${page.id}`;
    const children = addInstanceTree(asComponentArray(page.components), instances, page.id, rootInstanceId, 'root');
    instances[rootInstanceId] = {
      id: rootInstanceId,
      componentType: 'page-root',
      componentVersion: 1,
      children,
      props: {
        pageId: page.id,
        legacyHtml: page.components ? undefined : page.html,
        legacyCss: page.css,
      },
      styles: {},
      bindings: [],
      states: { name: page.name, locked: true },
    };
    return {
      id: page.id,
      name: page.name,
      slug: page.slug,
      isHomePage: page.isHomePage,
      rootInstanceId,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      ogImageUrl: page.ogImageUrl,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
  });

  const site: SiteSettings = project.siteSettings || { siteName: project.name || 'Untitled website' };
  const tokens: DesignTokens = { theme: project.theme };
  const baseDocument: Omit<WebsiteDocument, 'checksum'> = {
    schemaVersion: WEBSITE_DOCUMENT_SCHEMA_VERSION,
    site,
    pages: documentPages,
    instances,
    tokens,
    menus: [],
    assets: (project.assets || []) as AssetReference[],
    dataSources: [],
    createdAt: project.document?.createdAt || now,
    updatedAt: now,
  };

  return { ...baseDocument, checksum: checksumWebsiteDocument(baseDocument) };
}

function repairWebsiteDocument(document: WebsiteDocument): WebsiteDocument {
  const repaired = cloneJson(document);
  let changed = false;

  repaired.pages.forEach(page => {
    let root = repaired.instances[page.rootInstanceId];
    if (!root) {
      root = {
        id: page.rootInstanceId,
        componentType: 'page-root',
        componentVersion: 1,
        children: [],
        props: { pageId: page.id },
        styles: {},
        bindings: [],
        states: { name: page.name, locked: true },
      };
      repaired.instances[page.rootInstanceId] = root;
      changed = true;
    }

    const hasChildren = root.children.some(childId => Boolean(repaired.instances[childId]));
    const hasLegacyHtml = typeof root.props.legacyHtml === 'string' && root.props.legacyHtml.trim().length > 0;
    if (!hasChildren && !hasLegacyHtml) {
      root.children = addInstanceTree(
        defaultStarterComponents(repaired.site.siteName || page.name || 'Your Event Name'),
        repaired.instances,
        page.id,
        page.rootInstanceId,
        'starter',
      );
      changed = true;
    }
  });

  // Early canonical drafts could contain a valid tree in `children` while
  // omitting the mirrored `parentId` on its direct descendants. The tree is
  // authoritative, so reconcile it before validation/autosave can reject an
  // otherwise usable document.
  Object.values(repaired.instances).forEach(parent => {
    parent.children.forEach(childId => {
      const child = repaired.instances[childId];
      if (child && child.parentId !== parent.id) {
        child.parentId = parent.id;
        changed = true;
      }
    });
  });

  if (!changed) return document;
  const { checksum: _checksum, ...withoutChecksum } = repaired;
  return { ...repaired, checksum: checksumWebsiteDocument(withoutChecksum) };
}

export function projectDataFromWebsiteDocument(document: WebsiteDocument): WebsiteProjectData {
  const pages: PageConfig[] = document.pages.map(page => {
    const root = document.instances[page.rootInstanceId];
    const components = root
      ? root.children
          .map(childId => document.instances[childId])
          .filter(Boolean)
          .map(child => instanceToGrapesComponent(child, document))
      : [];
    return {
      id: page.id,
      name: page.name,
      slug: page.slug,
      isHomePage: page.isHomePage,
      rootInstanceId: page.rootInstanceId,
      html: typeof root?.props.legacyHtml === 'string' ? root.props.legacyHtml : '',
      css: typeof root?.props.legacyCss === 'string' ? root.props.legacyCss : '',
      components,
      styles: {},
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      ogImageUrl: page.ogImageUrl,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
  });

  return {
    name: document.site.siteName,
    document,
    pages,
    activePageId: pages.find(page => page.isHomePage)?.id || pages[0]?.id,
    siteSettings: document.site,
    assets: document.assets,
    theme: document.tokens.theme,
    updatedAt: document.updatedAt,
  };
}

export function ensureWebsiteDocument(project: WebsiteProjectData): WebsiteDocument {
  if (project.document?.schemaVersion === WEBSITE_DOCUMENT_SCHEMA_VERSION) {
    const { checksum: _checksum, ...withoutChecksum } = project.document;
    return repairWebsiteDocument({ ...project.document, checksum: checksumWebsiteDocument(withoutChecksum) });
  }
  return repairWebsiteDocument(buildWebsiteDocumentFromProject(project));
}

export function validateWebsiteDocument(document: WebsiteDocument): string[] {
  const diagnostics: string[] = [];
  const pageIds = new Set<string>();

  document.pages.forEach(page => {
    if (pageIds.has(page.id)) diagnostics.push(`Duplicate page id: ${page.id}`);
    pageIds.add(page.id);
    if (!document.instances[page.rootInstanceId]) diagnostics.push(`Missing root instance for page: ${page.name}`);
  });

  Object.values(document.instances).forEach(instance => {
    instance.children.forEach(childId => {
      if (!document.instances[childId]) diagnostics.push(`Missing child instance ${childId} referenced by ${instance.id}`);
      if (document.instances[childId]?.parentId !== instance.id) {
        diagnostics.push(`Parent mismatch for ${childId}`);
      }
    });
  });

  const homePages = document.pages.filter(page => page.isHomePage);
  if (homePages.length !== 1) diagnostics.push('Document must contain exactly one home page');
  return diagnostics;
}

export function getWebsiteDocumentDiagnostics(project: WebsiteProjectData): string[] {
  return validateWebsiteDocument(ensureWebsiteDocument(project));
}
