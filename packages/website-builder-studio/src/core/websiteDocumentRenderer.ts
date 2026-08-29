import type { ThemePalette, WebsiteDocument } from '../types';
import { websiteDocumentPageToGrapesComponents } from './documentModel';
import { buildThemeCss } from '../plugins/themePlugin';
import { PREVIEW_RUNTIME_CSS, WEBSITE_RUNTIME_SCRIPT } from './runtime';

export type WebsiteRenderMode = 'canvas' | 'preview' | 'export';

export interface WebsiteRenderResult {
  html: string;
  css: string;
  runtimeScripts: string[];
  diagnostics: string[];
}

type GrapesComponent = Record<string, unknown>;

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function styleToString(style: unknown): string {
  if (!style || typeof style !== 'object' || Array.isArray(style)) return '';
  return Object.entries(style as Record<string, unknown>)
    .filter(([, value]) => value !== null && typeof value !== 'undefined' && String(value) !== '')
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(';');
}

function attrsToString(component: GrapesComponent, mode: WebsiteRenderMode): string {
  const attrs = {
    ...((component.attributes && typeof component.attributes === 'object' && !Array.isArray(component.attributes)) ? component.attributes as Record<string, unknown> : {}),
  };
  const type = typeof component.type === 'string' ? component.type : attrs['data-gjs-type'];
  if (type && !attrs['data-gjs-type']) attrs['data-gjs-type'] = type;
  if (mode !== 'canvas') {
    delete attrs.contenteditable;
    delete attrs.draggable;
  }
  const style = styleToString(component.style);
  if (style) attrs.style = style;
  return Object.entries(attrs)
    .filter(([, value]) => value !== false && value !== null && typeof value !== 'undefined')
    .map(([key, value]) => value === true ? ` ${key}` : ` ${key}="${escapeHtml(value)}"`)
    .join('');
}

function componentChildrenToHtml(component: GrapesComponent, mode: WebsiteRenderMode): string {
  const rawChildren = component.components;
  if (typeof rawChildren === 'string') return rawChildren;
  if (Array.isArray(rawChildren) && rawChildren.length > 0) {
    return rawChildren
      .map(child => typeof child === 'string' ? escapeHtml(child) : componentToHtml(child as GrapesComponent, mode))
      .join('');
  }
  if (typeof component.content === 'string') return escapeHtml(component.content);
  return '';
}

function componentToHtml(component: GrapesComponent, mode: WebsiteRenderMode): string {
  const tagName = String(component.tagName || '').trim() || (component.type === 'textnode' ? '' : 'div');
  if (!tagName) return componentChildrenToHtml(component, mode);
  const attrs = attrsToString(component, mode);
  if (voidTags.has(tagName.toLowerCase())) return `<${tagName}${attrs}>`;
  return `<${tagName}${attrs}>${componentChildrenToHtml(component, mode)}</${tagName}>`;
}

function scriptString(value: string): string {
  return JSON.stringify(value)
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\!--')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function cssAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function styleDeclarations(styles: Record<string, string> | undefined): string {
  if (!styles) return '';
  return Object.entries(styles)
    .filter(([, value]) => value !== '')
    .map(([property, value]) => `${property}:${value}`)
    .join(';');
}

export function buildResponsiveDocumentCss(document: WebsiteDocument): string {
  const desktop: string[] = [];
  const tablet: string[] = [];
  const mobile: string[] = [];

  Object.values(document.instances).forEach(instance => {
    const selector = `[data-wb-instance-id="${cssAttributeValue(instance.id)}"]`;
    const desktopRules = styleDeclarations(instance.styles.desktop);
    const tabletRules = styleDeclarations(instance.styles.tablet);
    const mobileRules = styleDeclarations(instance.styles.mobile);
    if (desktopRules) desktop.push(`${selector}{${desktopRules}}`);
    if (tabletRules) tablet.push(`${selector}{${tabletRules}}`);
    if (mobileRules) mobile.push(`${selector}{${mobileRules}}`);
  });

  return [
    desktop.join('\n'),
    tablet.length ? `@media (max-width:1024px){\n${tablet.join('\n')}\n}` : '',
    mobile.length ? `@media (max-width:767px){\n${mobile.join('\n')}\n}` : '',
  ].filter(Boolean).join('\n');
}

export function renderWebsiteDocument(
  document: WebsiteDocument,
  pageId: string | undefined,
  mode: WebsiteRenderMode,
  options: { theme?: Partial<ThemePalette>; title?: string } = {},
): WebsiteRenderResult {
  const diagnostics: string[] = [];
  const page = document.pages.find(candidate => candidate.id === pageId) || document.pages.find(candidate => candidate.isHomePage) || document.pages[0];
  if (!page) diagnostics.push('No page available to render.');
  else if (!document.instances[page.rootInstanceId]) diagnostics.push(`Missing root instance for page ${page.name}.`);

  const components = page ? websiteDocumentPageToGrapesComponents(document, page.id) : [];
  const root = page ? document.instances[page.rootInstanceId] : undefined;
  const body = components.length
    ? components.map(component => componentToHtml(component, mode)).join('')
    : typeof root?.props.legacyHtml === 'string'
      ? root.props.legacyHtml
      : '';
  const themeCss = buildThemeCss(options.theme || document.tokens.theme);
  const pageCss = typeof root?.props.legacyCss === 'string' ? root.props.legacyCss : '';
  const globalCss = typeof document.site.globalCSS === 'string' ? document.site.globalCSS : '';
  const responsiveCss = buildResponsiveDocumentCss(document);
  const css = `${themeCss}\n${pageCss}\n${globalCss}\n${responsiveCss}\n${PREVIEW_RUNTIME_CSS}`;
  const runtimeScripts = mode === 'canvas' ? [] : [WEBSITE_RUNTIME_SCRIPT];
  const title = escapeHtml(options.title || page?.seoTitle || document.site.siteName || 'Website preview');

  const runtimeHtml = runtimeScripts
    .map(script => `<script>(0,eval)(${scriptString(script)});</script>`)
    .join('');
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@400;600;700;800;900&family=Poppins:wght@400;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root { color-scheme: dark; }
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--background, #080912); color: var(--foreground, #f8fafc); font-family: var(--font-body, 'Inter', sans-serif); overflow-x: hidden; }
    ${css}
  </style>
</head>
<body>${body}${runtimeHtml}</body>
</html>`;

  return { html, css, runtimeScripts, diagnostics };
}

export interface WebsiteExportPage {
  pageId: string;
  name: string;
  slug: string;
  route: string;
  artifactPath: string;
  html: string;
  title: string;
}

export interface WebsiteExportBundle {
  siteName: string;
  checksum: string;
  pages: WebsiteExportPage[];
  diagnostics: string[];
}

export function exportWebsiteBundle(
  document: WebsiteDocument,
  options: { theme?: Partial<ThemePalette> } = {},
): WebsiteExportBundle {
  const diagnostics: string[] = [];
  const pages: WebsiteExportPage[] = document.pages.map(page => {
    const route = page.isHomePage ? '/' : `/${page.slug}`;
    const artifactPath = page.isHomePage ? 'index.html' : `${page.slug}/index.html`;
    const title = page.seoTitle || `${page.name} | ${document.site.siteName || 'Event'}`;
    const result = renderWebsiteDocument(document, page.id, 'export', {
      theme: options.theme,
      title,
    });
    if (result.diagnostics.length) diagnostics.push(...result.diagnostics);
    return {
      pageId: page.id,
      name: page.name,
      slug: page.slug,
      route,
      artifactPath,
      html: result.html,
      title,
    };
  });

  return {
    siteName: document.site.siteName || '',
    checksum: document.checksum || '',
    pages,
    diagnostics,
  };
}

