import { useState, useCallback, useRef } from 'react';
import type { Editor } from 'grapesjs';
import type { PageConfig, WebsiteProjectData } from '../types';

function generateId(): string {
  return `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function now(): string {
  return new Date().toISOString();
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
  // Initialize pages from existing data or create a default home page
  const [pages, setPages] = useState<PageConfig[]>(() => {
    if (initialData?.pages?.length) return initialData.pages;
    const homeId = generateId();
    return [{
      id: homeId,
      name: 'Home',
      slug: '',
      isHomePage: true,
      html: initialData?.html || '',
      css: initialData?.css || '',
      components: initialData?.components,
      styles: initialData?.styles,
      seoTitle: '',
      seoDescription: '',
      createdAt: now(),
      updatedAt: now(),
    }];
  });

  const [activePageId, setActivePageId] = useState<string>(() => {
    if (initialData?.activePageId) return initialData.activePageId;
    return (initialData?.pages?.[0]?.id) ?? (pages[0]?.id ?? '');
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
            components: editor.getComponents() as unknown,
            styles: editor.getStyle() as unknown,
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
              components: editor.getComponents() as unknown,
              styles: editor.getStyle() as unknown,
              updatedAt: now(),
            }
          : p
      ));
    }

    // Load target page into canvas
    const targetPage = pagesRef.current.find(p => p.id === pageId);
    if (targetPage && editor) {
      if (targetPage.components) {
        editor.setComponents(targetPage.components as string);
      } else if (targetPage.html) {
        editor.setComponents(targetPage.html);
      } else {
        editor.setComponents('');
      }
      if (targetPage.styles) {
        editor.setStyle(targetPage.styles as string);
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
            ? { ...p, html: editor.getHtml(), css: editor.getCss() || '', components: editor.getComponents() as unknown, styles: editor.getStyle() as unknown, updatedAt: now() }
            : p
        )
      : pagesRef.current;

    return {
      pages: latestPages,
      activePageId: currentId,
      // Legacy fields for backward compat
      html: latestPages.find(p => p.isHomePage)?.html || '',
      css: latestPages.find(p => p.isHomePage)?.css || '',
      updatedAt: now(),
    };
  }, []);

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
