import { useState, useCallback, useRef } from 'react';
import type { Editor } from 'grapesjs';
import type { PageConfig, WebsiteProjectData } from '../types';
import { buildWebsiteDocumentFromProject, projectDataFromWebsiteDocument } from '../core/documentModel';

function generateId(): string {
  return `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function now(): string {
  return new Date().toISOString();
}

const legacyTypeAliases: Record<string, string> = {
  'contact-footer': 'footer',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeLegacyComponentTypes(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return value.replaceAll('data-gjs-type="contact-footer"', 'data-gjs-type="footer"');
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const normalized = value
      .map(item => normalizeLegacyComponentTypes(item, seen))
      .filter(item => typeof item !== 'undefined');
    seen.delete(value);
    return normalized;
  }

  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return undefined;
  seen.add(value);

  try {
    // GrapesJS keeps child components in Backbone collections. A top-level
    // collection's toJSON() does not always materialize every nested child, so
    // recursively invoke toJSON before accepting an object as document data.
    const maybeToJson = (value as { toJSON?: unknown }).toJSON;
    const source = typeof maybeToJson === 'function'
      ? (maybeToJson as () => unknown).call(value)
      : value;
    if (source !== value) return normalizeLegacyComponentTypes(source, seen);

    if (isPlainObject(source)) {
      const next: Record<string, unknown> = {};
      Object.entries(source).forEach(([key, childValue]) => {
        const normalized = key === 'type' && typeof childValue === 'string'
          ? legacyTypeAliases[childValue] || childValue
          : normalizeLegacyComponentTypes(childValue, seen);
        if (typeof normalized !== 'undefined') next[key] = normalized;
      });
      return next;
    }

    return source;
  } finally {
    seen.delete(value);
  }
}

function serializeComponents(editor: Editor): unknown {
  ensureCanvasInstanceIds(editor);
  return normalizeLegacyComponentTypes(editor.getComponents().toJSON());
}

function serializeStyles(editor: Editor): unknown {
  return normalizeLegacyComponentTypes(editor.getStyle());
}

function generateInstanceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `inst_${crypto.randomUUID()}`;
  }
  return `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureCanvasInstanceIds(editor: Editor): void {
  const visit = (component: any) => {
    if (!component) return;
    const attrs = typeof component.getAttributes === 'function' ? component.getAttributes() : {};
    if (!attrs?.['data-wb-instance-id'] && typeof component.addAttributes === 'function') {
      component.addAttributes({ 'data-wb-instance-id': generateInstanceId() });
    }
    const children = typeof component.components === 'function' ? component.components() : null;
    if (children && typeof children.forEach === 'function') {
      children.forEach((child: any) => visit(child));
    }
  };

  const root = editor.getComponents();
  if (root && typeof root.forEach === 'function') {
    root.forEach((component: any) => visit(component));
  }
}

export interface UseMultiPageReturn {
  pages: PageConfig[];
  activePageId: string;
  activePage: PageConfig | undefined;
  /** Switch to a page — saves current canvas first */
  switchPage: (pageId: string, editor: Editor | null) => void;
  /** Create a new blank page */
  createPage: (name?: string) => void;
  /** Delete a page (home page cannot be deleted) */
  deletePage: (pageId: string) => void;
  /** Rename a page */
  renamePage: (pageId: string, newName: string) => void;
  /** Serialize the current canvas into the active page */
  saveCurrentPage: (editor: Editor | null) => void;
  /** Build WebsiteProjectData for onSave/onPublish */
  buildProjectData: (editor: Editor | null) => WebsiteProjectData;
}

/**
 * useMultiPage
 *
 * Phase 6: Manages the multi-page state for the Website Builder Studio.
 * Serializes/loads page HTML + CSS from the GrapesJS editor on page switch.
 *
 * Architecture:
 *   - Each page has its own HTML, CSS, components, and styles
 *   - onSave/onPublish receives a WebsiteProjectData with pages[] (Option A)
 *   - One page is always marked isHomePage=true
 */
export function useMultiPage(initialData?: WebsiteProjectData): UseMultiPageReturn {
  const sourceInitialData = initialData?.document
    ? projectDataFromWebsiteDocument(initialData.document)
    : initialData;

  // Initialize pages from existing data or create a default home page
  const [pages, setPages] = useState<PageConfig[]>(() => {
    if (sourceInitialData?.pages?.length) {
      return sourceInitialData.pages.map(page => ({
        ...page,
        html: normalizeLegacyComponentTypes(page.html) as string,
        components: normalizeLegacyComponentTypes(page.components),
        styles: normalizeLegacyComponentTypes(page.styles),
      }));
    }
    const homeId = generateId();
    return [{
      id: homeId,
      name: 'Home',
      slug: '',
      isHomePage: true,
      html: normalizeLegacyComponentTypes(sourceInitialData?.html || '') as string,
      css: sourceInitialData?.css || '',
      components: normalizeLegacyComponentTypes(sourceInitialData?.components),
      styles: normalizeLegacyComponentTypes(sourceInitialData?.styles),
      seoTitle: '',
      seoDescription: '',
      createdAt: now(),
      updatedAt: now(),
    }];
  });

  const [activePageId, setActivePageId] = useState<string>(() => {
    if (sourceInitialData?.activePageId) return sourceInitialData.activePageId;
    return (sourceInitialData?.pages?.[0]?.id) ?? (pages[0]?.id ?? '');
  });

  // Keep a ref for immediate access in callbacks
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const saveCurrentPage = useCallback((editor: Editor | null) => {
    if (!editor) return;
    const currentId = activePageIdRef.current;
    setPages(prev => prev.map(p =>
      p.id === currentId
        ? {
            ...p,
            html: editor.getHtml(),
            css: editor.getCss() || '',
            components: serializeComponents(editor),
            styles: serializeStyles(editor),
            updatedAt: now(),
          }
        : p
    ));
  }, []);

  // Ref to access activePageId in callbacks without stale closure
  const activePageIdRef = useRef(activePageId);
  activePageIdRef.current = activePageId;

  const switchPage = useCallback((pageId: string, editor: Editor | null) => {
    if (pageId === activePageIdRef.current) return;

    // Serialize current page
    if (editor) {
      const currentId = activePageIdRef.current;
      setPages(prev => prev.map(p =>
        p.id === currentId
          ? {
              ...p,
              html: editor.getHtml(),
              css: editor.getCss() || '',
              components: serializeComponents(editor),
              styles: serializeStyles(editor),
              updatedAt: now(),
            }
          : p
      ));
    }

    // Load target page into canvas
      const targetPage = pagesRef.current.find(p => p.id === pageId);
    if (targetPage && editor) {
      if (targetPage.components) {
        editor.setComponents(normalizeLegacyComponentTypes(targetPage.components) as any);
      } else if (targetPage.html) {
        editor.setComponents(normalizeLegacyComponentTypes(targetPage.html) as any);
      } else {
        editor.setComponents('');
      }
      if (targetPage.styles) {
        editor.setStyle(normalizeLegacyComponentTypes(targetPage.styles) as any);
      } else if (targetPage.css) {
        editor.setStyle(targetPage.css);
      } else {
        editor.setStyle('');
      }
    }

    setActivePageId(pageId);
    activePageIdRef.current = pageId;
  }, []);

  const createPage = useCallback((name?: string) => {
    const pageName = name || `Page ${pagesRef.current.length + 1}`;
    const newPage: PageConfig = {
      id: generateId(),
      name: pageName,
      slug: generateSlug(pageName),
      isHomePage: false,
      html: '',
      css: '',
      seoTitle: '',
      seoDescription: '',
      createdAt: now(),
      updatedAt: now(),
    };
    setPages(prev => [...prev, newPage]);
  }, []);

  const deletePage = useCallback((pageId: string) => {
    const current = pagesRef.current;
    const target = current.find(p => p.id === pageId);
    if (!target || target.isHomePage) return;

    const remaining = current.filter(p => p.id !== pageId);
    setPages(remaining);

    // If we deleted the active page, switch to first page
    if (pageId === activePageIdRef.current) {
      setActivePageId(remaining[0]?.id ?? '');
      activePageIdRef.current = remaining[0]?.id ?? '';
    }
  }, []);

  const renamePage = useCallback((pageId: string, newName: string) => {
    setPages(prev => prev.map(p =>
      p.id === pageId
        ? { ...p, name: newName, slug: p.isHomePage ? '' : generateSlug(newName), updatedAt: now() }
        : p
    ));
  }, []);

  const buildProjectData = useCallback((editor: Editor | null): WebsiteProjectData => {
    // Save latest canvas state into pages array
    const currentId = activePageIdRef.current;
    const latestPages = editor
      ? pagesRef.current.map(p =>
          p.id === currentId
            ? { ...p, html: editor.getHtml(), css: editor.getCss() || '', components: serializeComponents(editor), styles: serializeStyles(editor), updatedAt: now() }
            : p
        )
      : pagesRef.current;

    const projectData: WebsiteProjectData = {
      pages: latestPages,
      activePageId: currentId,
      // Legacy fields for backward compat
      html: latestPages.find(p => p.isHomePage)?.html || '',
      css: latestPages.find(p => p.isHomePage)?.css || '',
      siteSettings: sourceInitialData?.siteSettings,
      assets: sourceInitialData?.assets,
      theme: sourceInitialData?.theme,
      updatedAt: now(),
    };
    return {
      ...projectData,
      document: buildWebsiteDocumentFromProject(projectData),
    };
  }, [sourceInitialData?.assets, sourceInitialData?.siteSettings, sourceInitialData?.theme]);

  const activePage = pages.find(p => p.id === activePageId);

  return {
    pages,
    activePageId,
    activePage,
    switchPage,
    createPage,
    deletePage,
    renamePage,
    saveCurrentPage,
    buildProjectData,
  };
}
