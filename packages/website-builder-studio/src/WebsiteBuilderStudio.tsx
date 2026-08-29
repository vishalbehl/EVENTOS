import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import grapesjs, { Editor } from 'grapesjs';
import {
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  Code2,
  Save,
  Rocket,
  ArrowLeft,
  Blocks,
  Layers,
  Eye,
  Trash2,
  Database,
  FileText,
  Settings2,
  Image as ImageIcon,
  Plus,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import type { ThemePalette, WebsiteAsset, WebsiteBuilderStudioProps, WebsiteDocument } from './types';
import { registerAllBlocks } from './blocks';
import { applyThemePlugin, buildThemeCss } from './plugins/themePlugin';
import { useEventImport } from './hooks/useEventImport';
import './core/properties/schemas/index'; // Register all Component Manifests
import { ImportDataPanel } from './components/ImportDataPanel';
import { BlockSearchFilter } from './components/BlockSearchFilter';
import { MultiPageManager } from './components/MultiPageManager';
import { NavigatorPanel } from './components/NavigatorPanel';
import { PropertyStudio } from './components/PropertyStudio';
import { registerComponentTypes } from './core/components/typeRegistry';
import { AssetLibraryPanel } from './components/AssetLibraryPanel';
import { TemplateLibraryPanel } from './components/TemplateLibraryPanel';
import type { WebsiteComponentAsset } from './component-assets';
import { renderUndrawSvg } from './core/assetLibrary';
import { mockEventSnapshot } from './core/eventMockData';
import { buildWebsiteDocumentFromProject, checksumWebsiteDocument, ensureWebsiteDocument, validateWebsiteDocument, projectDataFromWebsiteDocument } from './core/documentModel';
import { createGrapesCanvasAdapter, type GrapesCanvasAdapter } from './core/GrapesCanvasAdapter';
import { useWebsiteDocumentStore } from './core/websiteDocumentStore';
import { renderWebsiteDocument } from './core/websiteDocumentRenderer';
import { PREVIEW_RUNTIME_CSS, WEBSITE_RUNTIME_SCRIPT } from './core/runtime';
import { deleteWebsiteRecovery, loadWebsiteRecovery, saveWebsiteRecovery, type WebsiteRecoveryRecord } from './core/recoveryStore';
import { applyEventSnapshotToDocument } from './core/eventDataBinding';

type SidebarTab = 'blocks' | 'templates' | 'pages' | 'layers' | 'import' | 'assets';

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function stringifyForInlineScript(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\!--')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function pagePreviewPath(page: { slug: string; isHomePage?: boolean }): string {
  const normalizedSlug = String(page.slug || '').replace(/^\/+|\/+$/g, '');
  return page.isHomePage || !normalizedSlug ? '/' : `/${normalizedSlug}`;
}

function incomingPageLinkCount(document: NonNullable<ReturnType<typeof useWebsiteDocumentStore.getState>['document']>, pageId: string): number {
  const page = document.pages.find(candidate => candidate.id === pageId);
  if (!page) return 0;
  const route = page.isHomePage ? '/' : `/${page.slug}`;
  const instanceLinks = Object.values(document.instances).filter(instance => {
    const attributes = instance.props.attributes;
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return false;
    const attrs = attributes as Record<string, unknown>;
    const hrefRoute = typeof attrs.href === 'string' ? attrs.href.split('#')[0] : '';
    return attrs['data-page-id'] === pageId || hrefRoute === route;
  }).length;
  const menuLinks = document.menus.reduce(
    (count, menu) => count + menu.items.filter(item => item.pageId === pageId).length,
    0,
  );
  return instanceLinks + menuLinks;
}

function buildPreviewPageDocuments(
  document: NonNullable<ReturnType<typeof useWebsiteDocumentStore.getState>['document']>,
  theme: Partial<ThemePalette>,
  title: string,
): Record<string, string> {
  const pages: Record<string, string> = {};
  document.pages.forEach((page) => {
    pages[pagePreviewPath(page)] = renderWebsiteDocument(document, page.id, 'preview', {
      theme,
      title: page.seoTitle || title,
    }).html;
  });
  return pages;
}

function finalizeStudioDocument(
  document: WebsiteDocument,
  assets: WebsiteAsset[],
  theme: ThemePalette,
): WebsiteDocument {
  const next: WebsiteDocument = {
    ...document,
    assets,
    tokens: { ...document.tokens, theme },
    updatedAt: new Date().toISOString(),
  };
  const { checksum: _checksum, ...withoutChecksum } = next;
  return { ...next, checksum: checksumWebsiteDocument(withoutChecksum) };
}

const COMMAND_CENTER_THEME: ThemePalette = {
  primary: '#8b5cf6',
  primaryHover: '#7c3aed',
  secondary: '#22d3ee',
  background: '#05070d',
  surface: '#0b1017',
  card: '#101722',
  border: 'rgba(180, 190, 215, 0.13)',
  textOnPrimary: '#ffffff',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  radius: '8px',
};

const ORGANIZER_THEME: ThemePalette = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  secondary: '#14b8a6',
  background: '#07111f',
  surface: '#0f172a',
  card: '#111827',
  border: 'rgba(148, 163, 184, 0.18)',
  textOnPrimary: '#ffffff',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  radius: '10px',
};

function safeEditorSelection(editor: Editor) {
  try {
    return editor.getSelected();
  } catch {
    return null;
  }
}

export const WebsiteBuilderStudio: React.FC<WebsiteBuilderStudioProps> = ({
  mode,
  initialData,
  theme,
  eventData,
  eventSnapshot: initialSnapshot,
  eventId,
  onFetchEventData,
  onSearchImages,
  onPersistAsset,
  onUploadAsset,
  onSave,
  onPublish,
  onCreatePreview,
  onBack,
  logoUrl,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const dirtyRef = useRef(false);
  const autosaveInFlightRef = useRef(false);
  const previewWindowRef = useRef<Window | null>(null);
  const previewSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverPreviewSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverPreviewIdRef = useRef<string | undefined>(undefined);
  const serverPreviewUrlRef = useRef<string | null>(null);
  const previewBlobUrlRef = useRef<string | null>(null);
  const adapterRef = useRef<GrapesCanvasAdapter | null>(null);
  const pendingAssetSelectionRef = useRef<((asset: WebsiteAsset) => void) | null>(null);
  const initializedProjectKeyRef = useRef<string | null>(null);
  const appliedEventSnapshotKeyRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<SidebarTab>('blocks');
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const deviceRef = useRef<'desktop' | 'tablet' | 'mobile'>('desktop');
  deviceRef.current = device;
  const [isPreview, setIsPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightInspectorCollapsed, setRightInspectorCollapsed] = useState(false);
  const [hasSelectedComponent, setHasSelectedComponent] = useState(false);
  const [exportedCode, setExportedCode] = useState({ html: '', css: '' });
  const [publishSlug, setPublishSlug] = useState(initialData?.publishSlug || 'event-site');
  const [publishCustomDomain, setPublishCustomDomain] = useState('');
  const [editorReady, setEditorReady] = useState(false);
  const [loadedProjectKey, setLoadedProjectKey] = useState<string | null>(null);
  const [assets, setAssets] = useState<WebsiteAsset[]>(initialData?.assets || []);
  const [dataNotice, setDataNotice] = useState<string | null>(
    initialSnapshot ? null : 'Using mock event data for template design.',
  );
  const [recoveryCandidate, setRecoveryCandidate] = useState<WebsiteRecoveryRecord | null>(null);
  const resolvedTheme = useMemo<ThemePalette>(() => {
    const portalDefault = mode === 'GLOBAL_ADMIN' ? COMMAND_CENTER_THEME : ORGANIZER_THEME;
    return {
      ...portalDefault,
      ...(initialData?.theme || {}),
      ...(theme || {}),
    };
  }, [initialData?.theme, mode, theme]);
  const websiteDocument = useWebsiteDocumentStore(state => state.document);
  const activePageId = useWebsiteDocumentStore(state => state.activePageId);
  const initializeDocument = useWebsiteDocumentStore(state => state.initialize);
  const replaceDocument = useWebsiteDocumentStore(state => state.replaceDocument);
  const replaceActivePageFromProject = useWebsiteDocumentStore(state => state.replaceActivePageFromProject);
  const switchDocumentPage = useWebsiteDocumentStore(state => state.switchPage);
  const createDocumentPage = useWebsiteDocumentStore(state => state.createPage);
  const deleteDocumentPage = useWebsiteDocumentStore(state => state.deletePage);
  const renameDocumentPage = useWebsiteDocumentStore(state => state.renamePage);
  const selectDocumentInstance = useWebsiteDocumentStore(state => state.selectInstance);
  const upsertDocumentAsset = useWebsiteDocumentStore(state => state.upsertAsset);
  const insertDroppedItemRef = useRef<{
    handleAsset?: (asset: WebsiteAsset, options?: { targetComponent?: any }) => void;
    handleTemplate?: (asset: WebsiteComponentAsset, options?: { targetComponent?: any }) => void;
  }>({});

  const initialProjectKey = `${initialData?.id || 'new'}:${initialData?.updatedAt || initialData?.document?.checksum || ''}`;
  const recoveryProjectId = `${mode}:${eventId || initialData?.id || 'new-website'}`;

  useEffect(() => {
    if (initializedProjectKeyRef.current === initialProjectKey) return;
    initializedProjectKeyRef.current = initialProjectKey;
    initializeDocument({ ...(initialData || {}), theme: resolvedTheme });
    setLoadedProjectKey(initialProjectKey);
  }, [initialProjectKey, initializeDocument]);

  useEffect(() => {
    let active = true;
    void loadWebsiteRecovery(recoveryProjectId).then(record => {
      if (!active || !record || record.document.checksum === initialData?.document?.checksum) return;
      const serverUpdatedAt = Date.parse(initialData?.updatedAt || '') || 0;
      if (Date.parse(record.savedAt) > serverUpdatedAt) setRecoveryCandidate(record);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [initialData?.document?.checksum, initialData?.updatedAt, recoveryProjectId]);

  useEffect(() => {
    if (!websiteDocument) return;
    const timer = window.setTimeout(() => {
      void saveWebsiteRecovery(recoveryProjectId, websiteDocument).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [recoveryProjectId, websiteDocument]);

  useEffect(() => {
    const openPicker = (event: Event) => {
      const detail = (event as CustomEvent<{ select?: (asset: WebsiteAsset) => void }>).detail;
      if (typeof detail?.select !== 'function') return;
      pendingAssetSelectionRef.current = detail.select;
      setLeftSidebarCollapsed(false);
      setActiveTab('assets');
    };
    window.addEventListener('wb:open-asset-picker', openPicker);
    return () => window.removeEventListener('wb:open-asset-picker', openPicker);
  }, []);

  const restoreRecovery = useCallback(() => {
    if (!recoveryCandidate) return;
    initializeDocument({ ...(initialData || {}), document: recoveryCandidate.document });
    setRecoveryCandidate(null);
  }, [initialData, initializeDocument, recoveryCandidate]);

  const discardRecovery = useCallback(() => {
    void deleteWebsiteRecovery(recoveryProjectId).catch(() => undefined);
    setRecoveryCandidate(null);
  }, [recoveryProjectId]);

  const websiteDocumentReady = Boolean(websiteDocument) && loadedProjectKey === initialProjectKey;

  const documentProjectData = useMemo(
    () => websiteDocument ? projectDataFromWebsiteDocument(websiteDocument) : undefined,
    [websiteDocument],
  );
  const pages = documentProjectData?.pages || [];
  const activePage = pages.find(page => page.id === activePageId) || pages.find(page => page.isHomePage) || pages[0];

  const snapshotCanvasToDocument = useCallback(() => {
    const document = useWebsiteDocumentStore.getState().document;
    const currentPageId = useWebsiteDocumentStore.getState().activePageId;
    if (!document || !editorRef.current || !adapterRef.current) return document;
    const project = adapterRef.current.snapshotActivePage(document, currentPageId);
    replaceActivePageFromProject(project);
    return useWebsiteDocumentStore.getState().document;
  }, [replaceActivePageFromProject]);

  const renderActiveDocumentPage = useCallback((pageId = useWebsiteDocumentStore.getState().activePageId) => {
    const document = useWebsiteDocumentStore.getState().document;
    if (!document || !adapterRef.current) return;
    adapterRef.current.renderPage(document, pageId);
  }, []);

  const multiPage = useMemo(() => ({
    pages,
    activePageId,
    activePage,
    switchPage: (pageId: string, _editor: Editor | null) => {
      snapshotCanvasToDocument();
      switchDocumentPage(pageId);
      renderActiveDocumentPage(pageId);
    },
    createPage: (name?: string) => createDocumentPage(name),
    deletePage: (pageId: string) => {
      const document = useWebsiteDocumentStore.getState().document;
      const incomingLinks = document ? incomingPageLinkCount(document, pageId) : 0;
      if (incomingLinks > 0 && !window.confirm(
        `This page has ${incomingLinks} incoming link${incomingLinks === 1 ? '' : 's'}. Delete the page and remove those link targets?`,
      )) return;
      deleteDocumentPage(pageId);
      window.setTimeout(() => renderActiveDocumentPage(), 0);
    },
    renamePage: (pageId: string, name: string) => renameDocumentPage(pageId, name),
    saveCurrentPage: (_editor: Editor | null) => snapshotCanvasToDocument(),
    buildProjectData: (_editor: Editor | null) => {
      const document = snapshotCanvasToDocument();
      return document ? projectDataFromWebsiteDocument(document) : { name: initialData?.name || 'Untitled website' };
    },
  }), [
    activePage,
    activePageId,
    createDocumentPage,
    deleteDocumentPage,
    initialData?.name,
    pages,
    renameDocumentPage,
    renderActiveDocumentPage,
    snapshotCanvasToDocument,
    switchDocumentPage,
  ]);

  // ── Phase 4: Event Import State ─────────────────────────────────────────
  const eventImport = useEventImport(initialSnapshot || mockEventSnapshot, (_snap) => {
    // When snapshot changes, re-register blocks with new data
    if (editorRef.current && _snap) {
      // Clear existing blocks and re-register with fresh snapshot
      editorRef.current.BlockManager.getAll().reset();
      registerAllBlocks(editorRef.current, _snap || mockEventSnapshot);
    }
  });

  useEffect(() => {
    const snapshot = eventImport.snapshot;
    if (!snapshot || !websiteDocumentReady) return;
    const snapshotKey = `${loadedProjectKey}:${snapshot.snapshotId}:${snapshot.snapshotCreatedAt}:${snapshot.disconnectedAt || ''}`;
    if (appliedEventSnapshotKeyRef.current === snapshotKey) return;
    appliedEventSnapshotKeyRef.current = snapshotKey;

    const current = editorRef.current ? snapshotCanvasToDocument() : useWebsiteDocumentStore.getState().document;
    if (!current) return;
    const source = snapshot.snapshotId === mockEventSnapshot.snapshotId
      ? 'mock'
      : snapshot.disconnectedAt ? 'snapshot' : 'current-event';
    const resolved = applyEventSnapshotToDocument(current, snapshot, source);
    replaceDocument(resolved, useWebsiteDocumentStore.getState().activePageId);
    window.setTimeout(() => renderActiveDocumentPage(), 0);
  }, [eventImport.snapshot, loadedProjectKey, renderActiveDocumentPage, replaceDocument, snapshotCanvasToDocument, websiteDocumentReady]);

  // ── GrapesJS Init ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !websiteDocument || editorRef.current) return;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: '100%',
      storageManager: false,
      noticeOnUnload: false,
      panels: { defaults: [] },
      plugins: [],
      canvasCss: `${buildThemeCss(resolvedTheme)}\n${PREVIEW_RUNTIME_CSS}`,
      deviceManager: {
        devices: [
          { name: 'desktop', width: '' },
          { name: 'tablet', width: '768px', widthMedia: '992px' },
          { name: 'mobile', width: '375px', widthMedia: '480px' },
        ],
      },
      blockManager: { appendTo: '#gjs-blocks-container', blocks: [] },
      layerManager: { appendTo: '' },
      traitManager: { appendTo: '' },
      styleManager: {
        appendTo: '',
        sectors: [
          {
            name: 'Typography',
            open: true,
            properties: [
              {
                name: 'Font Family', property: 'font-family', type: 'select',
                options: [
                  { id: '', name: '— Inherited —' },
                  { id: "'Inter', sans-serif", name: 'Inter' },
                  { id: "'Roboto', sans-serif", name: 'Roboto' },
                  { id: "'Outfit', sans-serif", name: 'Outfit' },
                  { id: "'Poppins', sans-serif", name: 'Poppins' },
                  { id: "'Montserrat', sans-serif", name: 'Montserrat' },
                  { id: "'Playfair Display', serif", name: 'Playfair Display' },
                  { id: "'Georgia', serif", name: 'Georgia' },
                  { id: "'JetBrains Mono', monospace", name: 'JetBrains Mono' },
                ],
              },
              { name: 'Font Size', property: 'font-size', type: 'integer', units: ['px', 'em', 'rem', '%', 'vh', 'vw'], min: 0 },
              {
                name: 'Font Weight', property: 'font-weight', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: '300', name: 'Light' },
                  { id: '400', name: 'Normal' },
                  { id: '500', name: 'Medium' },
                  { id: '600', name: 'Semi Bold' },
                  { id: '700', name: 'Bold' },
                  { id: '800', name: 'Extra Bold' },
                  { id: '900', name: 'Black' },
                ],
              },
              { name: 'Text Color', property: 'color', type: 'color' },
              {
                name: 'Text Align', property: 'text-align', type: 'radio',
                options: [
                  { id: 'left', name: '←' },
                  { id: 'center', name: '↔' },
                  { id: 'right', name: '→' },
                  { id: 'justify', name: '≡' },
                ],
              },
              { name: 'Line Height', property: 'line-height', type: 'integer', units: ['', 'px', 'em', '%'], min: 0 },
              { name: 'Letter Spacing', property: 'letter-spacing', type: 'integer', units: ['px', 'em'], min: -10 },
              {
                name: 'Text Transform', property: 'text-transform', type: 'select',
                options: [
                  { id: '', name: '— None —' },
                  { id: 'uppercase', name: 'Uppercase' },
                  { id: 'lowercase', name: 'Lowercase' },
                  { id: 'capitalize', name: 'Capitalize' },
                ],
              },
              {
                name: 'Decoration', property: 'text-decoration', type: 'select',
                options: [
                  { id: '', name: '— None —' },
                  { id: 'underline', name: 'Underline' },
                  { id: 'line-through', name: 'Strikethrough' },
                ],
              },
            ],
          },
          {
            name: 'Spacing',
            open: false,
            properties: [
              {
                name: 'Margin', property: 'margin', type: 'composite',
                properties: [
                  { name: 'Top', property: 'margin-top', type: 'integer', units: ['px', 'em', 'rem', '%', 'vh'] },
                  { name: 'Right', property: 'margin-right', type: 'integer', units: ['px', 'em', 'rem', '%'] },
                  { name: 'Bottom', property: 'margin-bottom', type: 'integer', units: ['px', 'em', 'rem', '%', 'vh'] },
                  { name: 'Left', property: 'margin-left', type: 'integer', units: ['px', 'em', 'rem', '%'] },
                ],
              },
              {
                name: 'Padding', property: 'padding', type: 'composite',
                properties: [
                  { name: 'Top', property: 'padding-top', type: 'integer', units: ['px', 'em', 'rem', '%', 'vh'] },
                  { name: 'Right', property: 'padding-right', type: 'integer', units: ['px', 'em', 'rem', '%'] },
                  { name: 'Bottom', property: 'padding-bottom', type: 'integer', units: ['px', 'em', 'rem', '%', 'vh'] },
                  { name: 'Left', property: 'padding-left', type: 'integer', units: ['px', 'em', 'rem', '%'] },
                ],
              },
            ],
          },
          {
            name: 'Dimensions',
            open: false,
            properties: [
              {
                name: 'Display', property: 'display', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'block', name: 'Block' },
                  { id: 'flex', name: 'Flex' },
                  { id: 'inline-flex', name: 'Inline Flex' },
                  { id: 'grid', name: 'Grid' },
                  { id: 'inline-block', name: 'Inline Block' },
                  { id: 'none', name: 'Hidden' },
                ],
              },
              {
                name: 'Flex Direction', property: 'flex-direction', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'row', name: 'Row (Horizontal)' },
                  { id: 'row-reverse', name: 'Row Reverse' },
                  { id: 'column', name: 'Column (Vertical)' },
                  { id: 'column-reverse', name: 'Column Reverse' },
                ],
              },
              {
                name: 'Justify Content', property: 'justify-content', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'flex-start', name: 'Start' },
                  { id: 'center', name: 'Center' },
                  { id: 'flex-end', name: 'End' },
                  { id: 'space-between', name: 'Space Between' },
                  { id: 'space-around', name: 'Space Around' },
                  { id: 'space-evenly', name: 'Space Evenly' },
                ],
              },
              {
                name: 'Align Items', property: 'align-items', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'stretch', name: 'Stretch' },
                  { id: 'flex-start', name: 'Start' },
                  { id: 'center', name: 'Center' },
                  { id: 'flex-end', name: 'End' },
                  { id: 'baseline', name: 'Baseline' },
                ],
              },
              {
                name: 'Flex Wrap', property: 'flex-wrap', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'nowrap', name: 'No Wrap' },
                  { id: 'wrap', name: 'Wrap' },
                  { id: 'wrap-reverse', name: 'Wrap Reverse' },
                ],
              },
              { name: 'Gap', property: 'gap', type: 'integer', units: ['px', 'em', 'rem', '%'], min: 0 },
              { name: 'Width', property: 'width', type: 'integer', units: ['px', '%', 'em', 'rem', 'vw', 'vh'], min: 0 },
              { name: 'Height', property: 'height', type: 'integer', units: ['px', '%', 'em', 'rem', 'vh', 'vw'], min: 0 },
              { name: 'Max Width', property: 'max-width', type: 'integer', units: ['px', '%', 'em', 'rem', 'vw'], min: 0 },
              { name: 'Min Height', property: 'min-height', type: 'integer', units: ['px', '%', 'em', 'rem', 'vh'], min: 0 },
            ],
          },
          {
            name: 'Background',
            open: false,
            properties: [
              { name: 'Background Color', property: 'background-color', type: 'color' },
              { name: 'Background Image', property: 'background-image', type: 'text' },
              {
                name: 'Background Size', property: 'background-size', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'cover', name: 'Cover' },
                  { id: 'contain', name: 'Contain' },
                  { id: 'auto', name: 'Auto' },
                  { id: '100% 100%', name: 'Stretch' },
                ],
              },
              {
                name: 'Background Position', property: 'background-position', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'center center', name: 'Center' },
                  { id: 'top center', name: 'Top Center' },
                  { id: 'top left', name: 'Top Left' },
                  { id: 'top right', name: 'Top Right' },
                  { id: 'bottom center', name: 'Bottom Center' },
                ],
              },
              {
                name: 'Background Repeat', property: 'background-repeat', type: 'select',
                options: [
                  { id: 'no-repeat', name: 'No Repeat' },
                  { id: 'repeat', name: 'Repeat' },
                  { id: 'repeat-x', name: 'Repeat X' },
                  { id: 'repeat-y', name: 'Repeat Y' },
                ],
              },
            ],
          },
          {
            name: 'Border',
            open: false,
            properties: [
              {
                name: 'Border Style', property: 'border-style', type: 'select',
                options: [
                  { id: '', name: '— None —' },
                  { id: 'solid', name: 'Solid' },
                  { id: 'dashed', name: 'Dashed' },
                  { id: 'dotted', name: 'Dotted' },
                  { id: 'double', name: 'Double' },
                ],
              },
              { name: 'Border Width', property: 'border-width', type: 'integer', units: ['px'], min: 0 },
              { name: 'Border Color', property: 'border-color', type: 'color' },
              { name: 'Border Radius', property: 'border-radius', type: 'integer', units: ['px', '%'], min: 0 },
              { name: 'Box Shadow', property: 'box-shadow', type: 'text' },
            ],
          },
          {
            name: 'Effects',
            open: false,
            properties: [
              { name: 'Opacity', property: 'opacity', type: 'slider', min: 0, max: 1, step: 0.01 },
              { name: 'Transform', property: 'transform', type: 'text' },
              { name: 'Transition', property: 'transition', type: 'text' },
              { name: 'Filter', property: 'filter', type: 'text' },
              {
                name: 'Mix Blend Mode', property: 'mix-blend-mode', type: 'select',
                options: [
                  { id: '', name: '— Normal —' },
                  { id: 'multiply', name: 'Multiply' },
                  { id: 'screen', name: 'Screen' },
                  { id: 'overlay', name: 'Overlay' },
                  { id: 'darken', name: 'Darken' },
                  { id: 'lighten', name: 'Lighten' },
                  { id: 'color-dodge', name: 'Color Dodge' },
                ],
              },
              { name: 'Cursor', property: 'cursor', type: 'select', options: [
                { id: 'default', name: 'Default' }, { id: 'pointer', name: 'Pointer' },
                { id: 'not-allowed', name: 'Not Allowed' }, { id: 'grab', name: 'Grab' },
              ]},
            ],
          },
          {
            name: 'Position',
            open: false,
            properties: [
              {
                name: 'Position', property: 'position', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'static', name: 'Static' },
                  { id: 'relative', name: 'Relative' },
                  { id: 'absolute', name: 'Absolute' },
                  { id: 'fixed', name: 'Fixed' },
                  { id: 'sticky', name: 'Sticky' },
                ],
              },
              { name: 'Top', property: 'top', type: 'integer', units: ['px', '%', 'em', 'rem', 'vh'] },
              { name: 'Right', property: 'right', type: 'integer', units: ['px', '%', 'em', 'rem'] },
              { name: 'Bottom', property: 'bottom', type: 'integer', units: ['px', '%', 'em', 'rem', 'vh'] },
              { name: 'Left', property: 'left', type: 'integer', units: ['px', '%', 'em', 'rem'] },
              { name: 'Z-Index', property: 'z-index', type: 'integer' },
              {
                name: 'Overflow', property: 'overflow', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'visible', name: 'Visible' },
                  { id: 'hidden', name: 'Hidden' },
                  { id: 'auto', name: 'Auto (Scroll)' },
                  { id: 'scroll', name: 'Always Scroll' },
                ],
              },
            ],
          },
        ],
      },
    });

    editorRef.current = editor;

    // Register all custom component types first
    registerComponentTypes(editor);

    // Register all blocks (with snapshot if available)
    editor.BlockManager.getAll().reset();
    registerAllBlocks(editor, eventImport.snapshot || mockEventSnapshot);
    const injectCanvasTheme = applyThemePlugin(editor, resolvedTheme);
    adapterRef.current = createGrapesCanvasAdapter(editor, {
      getDocument: () => useWebsiteDocumentStore.getState().document,
      getActivePageId: () => useWebsiteDocumentStore.getState().activePageId,
      getDevice: () => deviceRef.current,
      onCanvasDocumentChange: replaceActivePageFromProject,
      onSelectionChange: selectDocumentInstance,
      onAfterRender: injectCanvasTheme,
    });
    adapterRef.current.renderPage(websiteDocument, activePageId || websiteDocument.pages.find(page => page.isHomePage)?.id || websiteDocument.pages[0]?.id || '');
    injectCanvasTheme();
    window.setTimeout(injectCanvasTheme, 0);

    const guardCanvasLinks = () => {
      const frameDocument = editor.Canvas.getDocument();
      if (!frameDocument || (frameDocument as Document & { __wbLinkGuarded?: boolean }).__wbLinkGuarded) return;
      (frameDocument as Document & { __wbLinkGuarded?: boolean }).__wbLinkGuarded = true;
      const selectCanvasElement = (element: Element | null) => {
        let current: Element | null = element;
        while (current && current !== frameDocument.body) {
          const instanceId = current.getAttribute('data-wb-instance-id');
          if (instanceId) {
            const escapedInstanceId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
              ? CSS.escape(instanceId)
              : instanceId.replace(/["\\]/g, '\\$&');
            const canonicalMatches = editor.getWrapper()?.find(`[data-wb-instance-id="${escapedInstanceId}"]`) || [];
            if (canonicalMatches[0]) {
              editor.select(canonicalMatches[0]);
              return true;
            }
          }
          const view = (current as Element & { __gjsv?: { model?: unknown } }).__gjsv;
          const model = view?.model;
          if (model) {
            editor.select(model as never);
            return true;
          }
          current = current.parentElement;
        }
        return false;
      };
      frameDocument.addEventListener('click', (event) => {
        const target = event.target as Element | null;
        const link = target?.closest?.('a[href]');
        if (selectCanvasElement(target)) {
          if (link) {
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
        if (!link) return;
        event.preventDefault();
        event.stopPropagation();
        const wrapper = editor.getWrapper();
        const candidates = wrapper?.find(`a[href="${CSS.escape(link.getAttribute('href') || '')}"]`) || [];
        if (candidates[0]) editor.select(candidates[0]);
      }, true);
    };

    function findComponentFromElement(editorInstance: Editor | null, el: HTMLElement | null): any {
      if (!editorInstance || !el) return null;
      const wrapper = editorInstance.getWrapper();
      if (!wrapper) return null;

      let curr: HTMLElement | null = el;
      while (curr && curr !== curr.ownerDocument?.body && curr !== curr.ownerDocument?.documentElement) {
        if ((curr as any)?._gjs) return (curr as any)._gjs;
        if ((curr as any)?.__gjs_model) return (curr as any).__gjs_model;

        const instanceId = curr.getAttribute?.('data-wb-instance-id');
        if (instanceId) {
          try {
            const matches = wrapper.find(`[data-wb-instance-id="${CSS.escape(instanceId)}"]`);
            if (matches && matches[0]) return matches[0];
          } catch {}
        }

        if (curr.id) {
          try {
            const matches = wrapper.find(`#${CSS.escape(curr.id)}`);
            if (matches && matches[0]) return matches[0];
          } catch {}
        }

        const gjsType = curr.getAttribute?.('data-gjs-type');
        if (gjsType && gjsType !== 'default') {
          try {
            const matches = wrapper.find(`[data-gjs-type="${CSS.escape(gjsType)}"]`);
            const match = matches?.find((m: any) => m.getEl?.() === curr);
            if (match) return match;
          } catch {}
        }

        curr = curr.parentElement;
      }

      return editorInstance.getSelected() || wrapper;
    }

    const attachCanvasDropListeners = () => {
      const frameDoc = editor.Canvas.getFrameEl()?.contentDocument;
      if (!frameDoc || (frameDoc as any).__wb_drop_attached__) return;
      (frameDoc as any).__wb_drop_attached__ = true;

      const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';

        const targetEl = frameDoc.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        if (targetEl) {
          const comp = findComponentFromElement(editor, targetEl);
          if (comp && comp !== editor.getSelected() && comp !== editor.getWrapper()) {
            editor.select(comp);
          }
        }
      };

      const handleDrop = async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const rawData = e.dataTransfer?.getData('application/x-eventos-builder-drag');
        let item: { type: 'template' | 'asset'; data: any; rawItem?: any } | null = null;
        if (rawData) {
          try { item = JSON.parse(rawData); } catch {}
        }
        if (!item && (window as any).__wb_dragged_item__) {
          item = (window as any).__wb_dragged_item__;
        }
        (window as any).__wb_dragged_item__ = null;
        if (!item) return;

        const targetEl = frameDoc.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const targetComponent = findComponentFromElement(editor, targetEl);

        if (item.type === 'template') {
          insertDroppedItemRef.current.handleTemplate?.(item.data, { targetComponent });
        } else if (item.type === 'asset') {
          if (item.data.type === 'svg' && !item.data.svg && item.rawItem) {
            try {
              item.data.svg = await renderUndrawSvg(item.rawItem, resolvedTheme.primary || '#6c63ff');
            } catch {}
          }
          insertDroppedItemRef.current.handleAsset?.(item.data, { targetComponent });
        }
      };

      frameDoc.addEventListener('dragover', handleDragOver, true);
      frameDoc.addEventListener('drop', handleDrop, true);
      frameDoc.defaultView?.addEventListener('dragover', handleDragOver, true);
      frameDoc.defaultView?.addEventListener('drop', handleDrop, true);
    };

    editor.on('load', () => {
      setEditorReady(true);
      guardCanvasLinks();
      attachCanvasDropListeners();

      // Dynamic Style Sectors based on selected component
      editor.on('component:selected', (model) => {
        // We no longer rely on GrapesJS style manager classes to show/hide sectors.
        // PropertyStudio (React) handles this now via component schemas.
      });
    });
    editor.on('canvas:frame:load', () => {
      guardCanvasLinks();
      attachCanvasDropListeners();
    });

    return () => {
      editor.off('canvas:frame:load', guardCanvasLinks);
      adapterRef.current?.destroy();
      adapterRef.current = null;
      editor.destroy();
      editorRef.current = null;
    };
  }, [websiteDocumentReady]);

  useEffect(() => {
    if (!websiteDocumentReady || !websiteDocument || !adapterRef.current || !editorRef.current) return;
    adapterRef.current.renderPage(websiteDocument, activePageId || websiteDocument.pages.find(page => page.isHomePage)?.id || websiteDocument.pages[0]?.id || '');
  }, [activePageId, initialProjectKey, websiteDocumentReady]);

  // ── Device Switcher ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady || !editorRef.current) return;
    const editor = editorRef.current;
    const syncSelection = () => {
      setHasSelectedComponent(Boolean(safeEditorSelection(editor)));
    };
    editor.on('component:selected', syncSelection);
    editor.on('component:deselected', syncSelection);
    editor.on('component:remove', syncSelection);
    syncSelection();
    return () => {
      editor.off('component:selected', syncSelection);
      editor.off('component:deselected', syncSelection);
      editor.off('component:remove', syncSelection);
    };
  }, [editorReady]);

  const handleDeviceChange = (d: 'desktop' | 'tablet' | 'mobile') => {
    setDevice(d);
    deviceRef.current = d;
    editorRef.current?.setDevice(d);
    window.setTimeout(() => renderActiveDocumentPage(), 0);
  };

  // ── Action Handlers ─────────────────────────────────────────────────────
  const handleUndo = () => {
    if (!readOnly) editorRef.current?.UndoManager.undo();
  };
  const handleRedo = () => {
    if (!readOnly) editorRef.current?.UndoManager.redo();
  };
  const handleClear = () => {
    if (readOnly) return;
    if (window.confirm('Clear the canvas? This cannot be undone.')) {
      editorRef.current?.setComponents('');
    }
  };

  const syncPreviewWindow = useCallback(() => {
    const target = previewWindowRef.current;
    if (!target || target.closed) {
      setIsPreview(false);
      previewWindowRef.current = null;
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
        previewBlobUrlRef.current = null;
      }
      return;
    }

    const canonicalDocument = snapshotCanvasToDocument() || useWebsiteDocumentStore.getState().document;
    if (!canonicalDocument) return;
    const effectiveTheme = canonicalDocument.tokens?.theme || resolvedTheme;
    const document = finalizeStudioDocument(canonicalDocument, assets, effectiveTheme);
    const previewTitle = initialData?.name || document.site.siteName || 'Website preview';
    const pageDocuments = buildPreviewPageDocuments(document, effectiveTheme, previewTitle);
    const activePage = document.pages.find(page => page.id === useWebsiteDocumentStore.getState().activePageId)
      || document.pages.find(page => page.isHomePage)
      || document.pages[0];
    const activePath = activePage ? pagePreviewPath(activePage) : '/';
    const siteDocument = pageDocuments[activePath]
      || Object.values(pageDocuments)[0]
      || '';
    const previewPayload = { html: siteDocument, pages: pageDocuments, activePath };
    if (onCreatePreview) {
      if (serverPreviewSyncTimerRef.current) clearTimeout(serverPreviewSyncTimerRef.current);
      serverPreviewSyncTimerRef.current = setTimeout(async () => {
        try {
          const projectData = {
            ...projectDataFromWebsiteDocument(document),
            activePageId: activePage?.id,
          };
          const preview = await onCreatePreview(projectData, serverPreviewIdRef.current);
          serverPreviewIdRef.current = preview.previewId;
          const desiredUrl = `${preview.url.replace(/\/$/, '')}${activePath === '/' ? '' : activePath}`;
          if (serverPreviewUrlRef.current !== desiredUrl) {
            serverPreviewUrlRef.current = desiredUrl;
            target.location.replace(desiredUrl);
          }
        } catch (error) {
          console.error('[Website Builder] Server preview failed:', error);
        }
      }, serverPreviewIdRef.current ? 650 : 0);
      return;
    }
    if (previewBlobUrlRef.current) {
      target.postMessage({ type: 'eventos-preview-update', ...previewPayload }, '*');
      return;
    }
    const initialPreviewHtml = stringifyForInlineScript(siteDocument);
    const initialPreviewPages = jsonForInlineScript(pageDocuments);
    const initialPreviewPath = stringifyForInlineScript(activePath);
    const previewShell = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtmlAttribute(initialData?.name || 'Website preview')}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; overflow: hidden; background: #080912; color: #f8fafc; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .wb-preview-shell { display: grid; grid-template-rows: 48px 1fr; height: 100vh; }
    .wb-preview-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid rgba(148, 163, 184, .18); background: rgba(8, 9, 18, .94); padding: 0 14px; }
    .wb-preview-title { min-width: 0; font-size: 12px; font-weight: 700; color: #e5e7eb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wb-preview-url { color: #94a3b8; font-size: 10px; font-weight: 500; }
    .wb-preview-devices { display: inline-flex; overflow: hidden; border: 1px solid rgba(148, 163, 184, .2); border-radius: 8px; }
    .wb-preview-devices button { border: 0; border-right: 1px solid rgba(148, 163, 184, .16); background: transparent; color: #cbd5e1; padding: 7px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
    .wb-preview-devices button:last-child { border-right: 0; }
    .wb-preview-devices button[aria-pressed="true"] { background: #6d28d9; color: white; }
    .wb-preview-stage { display: flex; min-height: 0; height: calc(100vh - 48px); justify-content: center; overflow: auto; padding: 0; background: #080912; }
    #wb-site-frame { display: block; width: 100%; max-width: 100%; height: calc(100vh - 48px); min-height: calc(100vh - 48px); border: 0; border-radius: 0; background: var(--background); box-shadow: none; transition: width .18s ease, border-radius .18s ease; }
    .wb-preview-error { margin: 48px auto; max-width: 680px; border: 1px solid rgba(248,113,113,.26); border-radius: 14px; background: rgba(127,29,29,.18); padding: 18px; color: #fecaca; font-size: 13px; line-height: 1.5; }
    .is-tablet .wb-preview-stage, .is-mobile .wb-preview-stage { padding: 24px; }
    .is-tablet #wb-site-frame, .is-mobile #wb-site-frame { border: 1px solid rgba(148, 163, 184, .2); border-radius: 12px; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
    .is-tablet #wb-site-frame { width: 768px; }
    .is-mobile #wb-site-frame { width: 390px; }
  </style>
</head>
<body>
  <div class="wb-preview-shell">
    <div class="wb-preview-toolbar">
      <div class="wb-preview-title">${escapeHtmlAttribute(initialData?.name || 'Website preview')} <span class="wb-preview-url">temporary preview link</span></div>
      <div class="wb-preview-devices" role="group" aria-label="Preview device">
        <button type="button" data-device="desktop" aria-pressed="true">Desktop</button>
        <button type="button" data-device="tablet" aria-pressed="false">Tablet</button>
        <button type="button" data-device="mobile" aria-pressed="false">Mobile</button>
      </div>
    </div>
    <main class="wb-preview-stage">
      <iframe id="wb-site-frame" title="Website preview"></iframe>
    </main>
  </div>
  <script>
    const initialHtml = ${initialPreviewHtml};
    const initialPages = ${initialPreviewPages};
    const initialPath = ${initialPreviewPath};
    const runtimeScript = ${stringifyForInlineScript(WEBSITE_RUNTIME_SCRIPT)};
    const frame = document.getElementById('wb-site-frame');
    const stage = document.querySelector('.wb-preview-stage');
    let previewPages = initialPages;
    let activePath = initialPath;
    const showPreviewError = message => {
      if (!stage) return;
      stage.innerHTML = '<div class="wb-preview-error"><strong>Preview could not render.</strong><br />' + String(message || 'Unknown preview error') + '</div>';
    };
    const normalizePath = value => {
      try {
        const url = new URL(value, 'https://eventos-preview.local');
        const path = url.pathname.replace(/\\/$/, '') || '/';
        return { path, hash: url.hash, external: url.origin !== 'https://eventos-preview.local' };
      } catch {
        return { path: value || '/', hash: '', external: false };
      }
    };
    const injectRuntime = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc || !doc.body) return;
        const existing = doc.getElementById('eventos-website-runtime');
        if (existing) existing.remove();
        const runtime = doc.createElement('script');
        runtime.id = 'eventos-website-runtime';
        runtime.textContent = runtimeScript;
        doc.body.appendChild(runtime);
        if (doc.__eventosPreviewLinkGuarded) return;
        doc.__eventosPreviewLinkGuarded = true;
        doc.addEventListener('click', event => {
          const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
          if (!link) return;
          const href = link.getAttribute('href') || '';
          if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;
          const target = link.getAttribute('target');
          const resolved = normalizePath(href);
          if (href.startsWith('#')) {
            event.preventDefault();
            try { doc.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
            return;
          }
          if (resolved.external || target === '_blank') return;
          if (previewPages[resolved.path]) {
            event.preventDefault();
            activePath = resolved.path;
            render(previewPages[resolved.path]);
            window.history.replaceState(null, '', '#' + resolved.path.replace(/^\\//, ''));
            window.setTimeout(() => {
              try {
                if (resolved.hash) frame.contentDocument?.querySelector(resolved.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } catch {}
            }, 30);
            return;
          }
          if (href.startsWith('/')) {
            event.preventDefault();
            window.open(href, '_blank', 'noopener,noreferrer');
          }
        });
      } catch (error) {
        showPreviewError(error && error.message ? error.message : error);
      }
    };
    const render = nextHtml => {
      try {
        frame.onload = injectRuntime;
        frame.srcdoc = nextHtml || '<!doctype html><html><body></body></html>';
      } catch (error) {
        showPreviewError(error && error.message ? error.message : error);
      }
    };
    frame.onload = injectRuntime;
    try {
      render(initialHtml);
    } catch (error) {
      showPreviewError(error && error.message ? error.message : error);
    }
    window.setTimeout(injectRuntime, 0);
    window.addEventListener('message', event => {
      if (!event.data || event.data.type !== 'eventos-preview-update') return;
      previewPages = event.data.pages || previewPages;
      activePath = event.data.activePath || activePath;
      render(event.data.html || previewPages[activePath] || '');
    });
    document.querySelectorAll('[data-device]').forEach(button => {
      button.addEventListener('click', () => {
        document.body.classList.remove('is-tablet', 'is-mobile');
        if (button.dataset.device !== 'desktop') document.body.classList.add('is-' + button.dataset.device);
        document.querySelectorAll('[data-device]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      });
    });
  </script>
</body>
</html>`;
    const nextUrl = URL.createObjectURL(new Blob([previewShell], { type: 'text/html' }));
    const previousUrl = previewBlobUrlRef.current;
    previewBlobUrlRef.current = nextUrl;
    target.location.replace(nextUrl);
    if (previousUrl) {
      window.setTimeout(() => URL.revokeObjectURL(previousUrl), 1000);
    }
  }, [assets, initialData?.name, onCreatePreview, resolvedTheme, snapshotCanvasToDocument]);

  const handleOpenPreview = useCallback(() => {
    if (!editorRef.current) return;
    const existing = previewWindowRef.current;
    const shouldCreatePreviewShell = !existing || existing.closed;
    if (shouldCreatePreviewShell && previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
    const target = !shouldCreatePreviewShell ? existing : window.open('about:blank', 'eventos-website-preview');
    if (!target) {
      alert('Preview was blocked by the browser. Allow popups for this app and try again.');
      return;
    }
    previewWindowRef.current = target;
    setIsPreview(true);
    syncPreviewWindow();
    window.setTimeout(syncPreviewWindow, 350);
    window.setTimeout(syncPreviewWindow, 1000);
    target.focus();
  }, [syncPreviewWindow]);

  useEffect(() => {
    if (!previewWindowRef.current || previewWindowRef.current.closed) return;
    const timer = window.setTimeout(syncPreviewWindow, 180);
    return () => window.clearTimeout(timer);
  }, [activePageId, syncPreviewWindow]);

  const handleViewCode = () => {
    const canonicalDocument = snapshotCanvasToDocument() || useWebsiteDocumentStore.getState().document;
    if (!canonicalDocument) return;
    const document = finalizeStudioDocument(canonicalDocument, assets, resolvedTheme);
    const rendered = renderWebsiteDocument(document, useWebsiteDocumentStore.getState().activePageId, 'export', {
      theme: resolvedTheme,
      title: initialData?.name || document.site.siteName || 'Website export',
    });
    setExportedCode({ html: rendered.html, css: rendered.css });
    setCodeModalOpen(true);
  };

  const buildProjectDataWithAssets = useCallback(() => {
    const currentDocument = snapshotCanvasToDocument() || useWebsiteDocumentStore.getState().document;
    if (!currentDocument) return { name: initialData?.name || 'Untitled website', assets };
    const repairedDocument = ensureWebsiteDocument({ document: currentDocument });
    if (repairedDocument !== currentDocument) {
      replaceDocument(repairedDocument, useWebsiteDocumentStore.getState().activePageId);
    }
    const document = finalizeStudioDocument(repairedDocument, assets, resolvedTheme);
    const diagnostics = validateWebsiteDocument(document);
    if (diagnostics.length) {
      console.warn('[website-builder] Canonical document diagnostics', diagnostics);
    }
    return {
      ...projectDataFromWebsiteDocument(document),
      document,
      assets,
      theme: resolvedTheme,
      activePageId: useWebsiteDocumentStore.getState().activePageId,
    };
  }, [assets, initialData?.name, replaceDocument, resolvedTheme, snapshotCanvasToDocument]);

  useEffect(() => {
    if (!editorReady || !onSave || !editorRef.current) return;

    const editor = editorRef.current;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (maxTimer) clearTimeout(maxTimer);
      debounceTimer = null;
      maxTimer = null;
    };

    const runAutosave = async () => {
      if (!dirtyRef.current || autosaveInFlightRef.current) return;
      dirtyRef.current = false;
      autosaveInFlightRef.current = true;
      clearTimers();
      try {
        setIsSaving(true);
        const data = buildProjectDataWithAssets();
        useWebsiteDocumentStore.getState().saveLocalRecovery('wb_local_recovery_draft');
        await onSave(data);
        useWebsiteDocumentStore.getState().markClean();
      } catch (error) {
        dirtyRef.current = true;
        useWebsiteDocumentStore.getState().saveLocalRecovery('wb_local_recovery_draft');
        const isAuthError = Boolean(
          (error as { status?: number })?.status === 401 ||
          (error as { code?: string })?.code === 'HTTP_401' ||
          String((error as Error)?.message || '').includes('Token is invalid') ||
          String((error as Error)?.message || '').includes('expired')
        );
        if (isAuthError) {
          console.warn('[website-builder] Autosave deferred: session token expired. Work is saved in local recovery.');
        } else {
          console.error('[website-builder] Autosave failed:', error);
        }
      } finally {
        autosaveInFlightRef.current = false;
        setIsSaving(false);
      }
    };

    const markDirty = () => {
      dirtyRef.current = true;
      try {
        useWebsiteDocumentStore.getState().saveLocalRecovery('wb_local_recovery_draft');
      } catch {}

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runAutosave, 8000);
      if (!maxTimer) maxTimer = setTimeout(runAutosave, 60000);
    };

    const handleBeforeUnload = () => {
      if (dirtyRef.current) {
        try {
          snapshotCanvasToDocument();
          useWebsiteDocumentStore.getState().saveLocalRecovery('wb_local_recovery_draft');
        } catch {}
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    const events = [
      'component:add',
      'component:update',
      'component:remove',
      'component:styleUpdate',
      'style:property:update',
      'asset:add',
    ];
    events.forEach(eventName => editor.on(eventName, markDirty));

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      events.forEach(eventName => editor.off(eventName, markDirty));
      clearTimers();
    };
  }, [buildProjectDataWithAssets, editorReady, onSave, snapshotCanvasToDocument]);

  useEffect(() => {
    if (!editorReady || !editorRef.current) return;
    const editor = editorRef.current;
    const schedulePreviewSync = () => {
      if (!previewWindowRef.current || previewWindowRef.current.closed) return;
      if (previewSyncTimerRef.current) clearTimeout(previewSyncTimerRef.current);
      if (serverPreviewSyncTimerRef.current) clearTimeout(serverPreviewSyncTimerRef.current);
      previewSyncTimerRef.current = setTimeout(syncPreviewWindow, 120);
    };
    const events = [
      'component:add',
      'component:update',
      'component:remove',
      'component:styleUpdate',
      'style:property:update',
      'asset:add',
    ];
    events.forEach(eventName => editor.on(eventName, schedulePreviewSync));
    return () => {
      events.forEach(eventName => editor.off(eventName, schedulePreviewSync));
      if (previewSyncTimerRef.current) clearTimeout(previewSyncTimerRef.current);
    };
  }, [editorReady, syncPreviewWindow]);

  useEffect(() => {
    return () => {
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
        previewBlobUrlRef.current = null;
      }
    };
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!onSave || readOnly) return;
    try {
      setIsSaving(true);
      const data = buildProjectDataWithAssets();
      await onSave(data);
      dirtyRef.current = false;
    } finally {
      setIsSaving(false);
    }
  }, [onSave, readOnly, buildProjectDataWithAssets]);

  const handlePublishClick = useCallback(() => {
    if (readOnly) return;
    setPublishModalOpen(true);
  }, [readOnly]);

  const handleConfirmPublish = useCallback(async () => {
    if (!onPublish || readOnly) return;
    const slug = publishSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      alert('Enter a valid application URL slug using letters, numbers, and single hyphens.');
      return;
    }
    try {
      setIsSaving(true);
      const data = buildProjectDataWithAssets();
      await onPublish(data, { slug, customDomain: publishCustomDomain.trim() || undefined });
      setPublishSlug(slug);
      setPublishModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  }, [onPublish, publishCustomDomain, publishSlug, readOnly, buildProjectDataWithAssets]);

  // ── Import Panel handlers ────────────────────────────────────────────────
  const handleFetchEventData = useCallback(async () => {
    if (!onFetchEventData) {
      eventImport.importFromProp(initialSnapshot || mockEventSnapshot);
      setDataNotice(initialSnapshot ? null : 'No event fetch hook is configured here. Mock event data is active.');
      return;
    }

    try {
      const snapshot = await onFetchEventData(eventId);
      eventImport.importFromProp(snapshot);
      setDataNotice(null);
    } catch {
      eventImport.importFromProp(mockEventSnapshot);
      setDataNotice('Could not fetch event data. Mock event data is active.');
    }
  }, [eventId, eventImport, initialSnapshot, onFetchEventData]);

  const handleDisconnect = useCallback(() => {
    eventImport.disconnect();
  }, [eventImport]);

  const handleAssetSave = useCallback(async (asset: WebsiteAsset) => {
    if (readOnly) return asset;
    const savedAsset = onPersistAsset ? await onPersistAsset(asset) : asset;
    setAssets(prev => prev.some(a => a.id === savedAsset.id) ? prev : [savedAsset, ...prev]);
    upsertDocumentAsset(savedAsset);
    return savedAsset;
  }, [onPersistAsset, readOnly, upsertDocumentAsset]);

  const handleAssetInsert = useCallback((asset: WebsiteAsset, options?: { targetComponent?: any }) => {
    if (readOnly) return;
    setAssets(prev => prev.some(a => a.id === asset.id) ? prev : [asset, ...prev]);
    upsertDocumentAsset(asset);
    if (pendingAssetSelectionRef.current) {
      const select = pendingAssetSelectionRef.current;
      pendingAssetSelectionRef.current = null;
      select(asset);
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;

    let payload = '';
    if (asset.svg) {
      payload = `<div data-component-type="svg-asset" data-asset-id="${escapeHtmlAttribute(asset.id)}" data-asset-title="${escapeHtmlAttribute(asset.title)}" style="width: 100%; max-width: 640px; min-height: 220px; margin: 24px auto; display: block; box-sizing: border-box;">${asset.svg}</div>`;
    } else if (asset.type === 'icon' && asset.url) {
      payload = `<span data-gjs-type="icon-block" data-component-type="icon-asset" data-asset-id="${escapeHtmlAttribute(asset.id)}" data-icon="${escapeHtmlAttribute(asset.title)}" role="img" aria-label="${escapeHtmlAttribute(asset.title)}" style="display:inline-flex;width:48px;height:48px;align-items:center;justify-content:center;color:var(--pri,var(--primary));"><span aria-hidden="true" style="display:block;width:32px;height:32px;background:currentColor;-webkit-mask:url('${escapeHtmlAttribute(asset.url)}') center / contain no-repeat;mask:url('${escapeHtmlAttribute(asset.url)}') center / contain no-repeat;"></span></span>`;
    } else if (asset.url) {
      payload = `<img data-gjs-type="image" data-asset-id="${escapeHtmlAttribute(asset.id)}" src="${escapeHtmlAttribute(asset.url)}" alt="${escapeHtmlAttribute(asset.title)}" loading="lazy" style="width: 100%; max-width: 720px; height: auto; display: block; border-radius: 16px; object-fit: cover;" />`;
    }

    if (!payload) return;

    const target = options?.targetComponent || editor.getSelected();
    if (target && typeof target.get === 'function') {
      const tagName = (target.get('tagName') || '').toLowerCase();
      const isContainer =
        target.is('wrapper') ||
        target.is('container') ||
        target.is('section') ||
        target.is('row') ||
        target.is('column') ||
        target.is('grid') ||
        ['div', 'section', 'main', 'article', 'aside', 'header', 'footer', 'form'].includes(tagName);

      if (isContainer) {
        target.append(payload);
      } else {
        const parent = target.parent() || editor.getWrapper();
        const index = target.index();
        parent.components().add(payload, { at: typeof index === 'number' ? index + 1 : undefined });
      }
    } else {
      editor.addComponents(payload);
    }

    window.setTimeout(() => {
      snapshotCanvasToDocument();
    }, 0);
  }, [readOnly, snapshotCanvasToDocument, upsertDocumentAsset]);

  const handleComponentAssetInsert = useCallback((asset: WebsiteComponentAsset, options?: { targetComponent?: any }) => {
    if (readOnly) return;
    const editor = editorRef.current;
    if (!editor) return;

    if (asset.kind === 'template' && asset.template?.pages.length) {
      const shouldApply = window.confirm(`Apply the ${asset.name} template? This replaces the current website pages.`);
      if (!shouldApply) return;
      const timestamp = new Date().toISOString();
      const currentDocument = useWebsiteDocumentStore.getState().document;
      const pages = asset.template.pages.map(page => {
        const parsed = editor.Parser.parseHtml(page.html);
        return {
          id: page.id,
          name: page.name,
          slug: page.slug,
          isHomePage: page.isHomePage,
          html: '',
          css: '',
          components: parsed.html,
          styles: parsed.css,
          seoTitle: page.seoTitle || `${asset.name} - ${page.name}`,
          seoDescription: page.seoDescription || asset.description,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      });
      const nextDocument = buildWebsiteDocumentFromProject({
        name: asset.name,
        pages,
        activePageId: pages.find(page => page.isHomePage)?.id || pages[0]?.id,
        siteSettings: {
          ...currentDocument?.site,
          siteName: asset.name,
        },
        assets: currentDocument?.assets,
        theme: asset.template.theme,
        updatedAt: timestamp,
      });
      replaceDocument(nextDocument, pages.find(page => page.isHomePage)?.id || pages[0]?.id);
      setActiveTab('pages');
      window.setTimeout(() => renderActiveDocumentPage(pages.find(page => page.isHomePage)?.id || pages[0]?.id), 0);
      return;
    }

    const payload = asset.json?.components?.length ? asset.json.components : asset.html;
    const target = options?.targetComponent || editor.getSelected();
    if (target && typeof target.get === 'function') {
      const tagName = (target.get('tagName') || '').toLowerCase();
      const isContainer =
        target.is('wrapper') ||
        target.is('container') ||
        target.is('section') ||
        target.is('row') ||
        target.is('column') ||
        target.is('grid') ||
        ['div', 'section', 'main', 'article', 'aside', 'header', 'footer', 'form'].includes(tagName);

      if (isContainer) {
        target.append(payload as never);
      } else {
        const parent = target.parent() || editor.getWrapper();
        const index = target.index();
        parent.components().add(payload as never, { at: typeof index === 'number' ? index + 1 : undefined });
      }
    } else {
      editor.addComponents(payload as never);
    }
    window.setTimeout(() => {
      snapshotCanvasToDocument();
    }, 0);
  }, [readOnly, renderActiveDocumentPage, replaceDocument, snapshotCanvasToDocument]);

  useEffect(() => {
    insertDroppedItemRef.current.handleAsset = handleAssetInsert;
    insertDroppedItemRef.current.handleTemplate = handleComponentAssetInsert;
  }, [handleAssetInsert, handleComponentAssetInsert]);

  // ── Sidebar Tab Config ───────────────────────────────────────────────────
  const tabs: { id: SidebarTab; icon: React.ReactNode; label: string; show: boolean }[] = [
    { id: 'blocks', icon: <Blocks size={14} />, label: 'Blocks', show: true },
    { id: 'templates', icon: <FileText size={14} />, label: 'Templates', show: true },
    { id: 'pages', icon: <FileText size={14} />, label: 'Pages', show: true },
    { id: 'layers', icon: <Layers size={14} />, label: 'Layers', show: true },
    { id: 'assets', icon: <ImageIcon size={14} />, label: 'Assets', show: true },
    { id: 'import', icon: <Database size={14} />, label: 'Event Data', show: true },
  ];
  const publishDefaultUrl = `https://eventos.app/sites/${publishSlug || 'event-site'}`;
  const portalClassName = mode === 'GLOBAL_ADMIN' ? 'wb-command-center-shell' : 'wb-organizer-shell';

  return (
    <div className={`gjs-studio-wrapper ${portalClassName} ${leftSidebarCollapsed ? 'wb-left-collapsed' : ''} ${rightInspectorCollapsed ? 'wb-right-collapsed' : ''} ${readOnly ? 'wb-studio--readonly' : ''}`}>
      {/* ── Top Navigation Header ─────────────────────────────────────────── */}
      <header className="gjs-studio-header">
        <div className="gjs-studio-brand">
          {onBack && (
            <button onClick={onBack} className="gjs-action-btn gjs-action-btn-secondary" title="Back" aria-label="Back">
              <ArrowLeft size={16} />
            </button>
          )}
          {logoUrl
            ? <img src={logoUrl} alt="Logo" style={{ height: 28 }} />
            : <span style={{ color: 'var(--primary)', fontWeight: 800 }}>EVENTOS</span>
          }
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-foreground)' }}>Website Builder</span>
          {/* Active page indicator */}
          {multiPage.pages.length > 1 && (
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)', background: 'var(--bg-surface-hover, rgba(255,255,255,0.04))', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 999 }}>
              📄 {multiPage.activePage?.name || 'Home'}
            </span>
          )}
          {/* Import status dot */}
          {eventImport.status === 'connected' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)', display: 'inline-block' }} title="Event data connected" />
          )}
          {eventImport.status === 'disconnected' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} title="Static snapshot" />
          )}
          {readOnly && <span className="wb-readonly-badge">Read only</span>}
        </div>

        {/* Viewport Device Switcher */}
        <div className="gjs-studio-devices">
          {(['desktop', 'tablet', 'mobile'] as const).map((d, i) => (
            <button
              key={d}
              className={`gjs-device-btn ${device === d ? 'active' : ''}`}
              onClick={() => handleDeviceChange(d)}
            >
              {i === 0 ? <Monitor size={14} /> : i === 1 ? <Tablet size={14} /> : <Smartphone size={14} />}
              <span>{d.charAt(0).toUpperCase() + d.slice(1)}</span>
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="gjs-studio-actions">
          <button onClick={handleUndo} disabled={readOnly} className="gjs-action-btn gjs-action-btn-secondary" title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={15} /></button>
          <button onClick={handleRedo} disabled={readOnly} className="gjs-action-btn gjs-action-btn-secondary" title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={15} /></button>
          <button onClick={handleClear} disabled={readOnly} className="gjs-action-btn gjs-action-btn-secondary" title="Clear Canvas" aria-label="Clear Canvas"><Trash2 size={15} /></button>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <button onClick={handleOpenPreview} className="gjs-action-btn gjs-action-btn-secondary" aria-label="Open Preview">
            <Eye size={15} /> <span>{isPreview ? 'Preview live' : 'Preview'}</span>
          </button>
          <button onClick={handleViewCode} className="gjs-action-btn gjs-action-btn-secondary" aria-label="Export Code">
            <Code2 size={15} /> <span className="wb-action-label--compact">Export</span>
          </button>
          {onSave && (
            <button onClick={handleSaveDraft} disabled={isSaving || readOnly} className="gjs-action-btn gjs-action-btn-secondary wb-save-draft" aria-label="Save Draft">
              <Save size={15} /> {isSaving ? 'Saving…' : 'Save Draft'}
            </button>
          )}
          {onPublish && (
            <button onClick={handlePublishClick} disabled={isSaving || readOnly} className="gjs-action-btn gjs-action-btn-primary" aria-label="Publish">
              <Rocket size={15} /> Publish
            </button>
          )}
        </div>
      </header>

      {recoveryCandidate && (
        <div className="wb-recovery-banner" role="status">
          <span>A newer local recovery copy is available from {new Date(recoveryCandidate.savedAt).toLocaleString()}.</span>
          <button type="button" onClick={restoreRecovery}>Restore</button>
          <button type="button" onClick={discardRecovery}>Discard</button>
        </div>
      )}

      {/* ── Main Studio Body ──────────────────────────────────────────────── */}
      <div className="gjs-studio-body">

        <aside className="gjs-studio-rail" aria-label="Website builder tools">
          <button className="gjs-rail-create" type="button" title="Add components" aria-label="Add components" onClick={() => { setActiveTab('blocks'); setLeftSidebarCollapsed(false); }}>
            <Plus size={24} />
          </button>
          <div className="gjs-rail-tabs">
            {tabs.filter(t => t.show).map(tab => (
              <button
                key={tab.id}
                className={`gjs-rail-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab.id); setLeftSidebarCollapsed(false); }}
                title={tab.label}
                aria-label={tab.label}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Left Sidebar */}
        <aside className="gjs-studio-sidebar">
          <div className="gjs-sidebar-panel-head">
            <div>
              <h2>{activeTab === 'blocks' ? 'Components Library' : tabs.find(tab => tab.id === activeTab)?.label}</h2>
              <p>{activeTab === 'blocks' ? 'Drag reusable blocks into the canvas' : activeTab === 'templates' ? 'Search reusable site sections and starters' : 'Manage this website section'}</p>
            </div>
            <button
              type="button"
              className="gjs-panel-tool"
              title="Collapse components sidebar"
              aria-label="Collapse components sidebar"
              onClick={() => setLeftSidebarCollapsed(true)}
            >
              <PanelLeftClose size={15} />
            </button>
          </div>

          <div className="gjs-sidebar-content">
            {/* ── BLOCKS TAB ─────────────────────────────────────────────── */}
            <div style={{ display: activeTab === 'blocks' ? 'block' : 'none' }}>
              <BlockSearchFilter editor={editorReady ? editorRef.current : null} />
              <div id="gjs-blocks-container" />
            </div>

            {activeTab === 'templates' && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: '0 0 12px 0' }}>
                  Template Library
                </p>
                <TemplateLibraryPanel onInsert={handleComponentAssetInsert} />
              </div>
            )}

            {/* ── PAGES TAB ──────────────────────────────────────────────── */}
            {activeTab === 'pages' && (
              <MultiPageManager
                editor={editorRef.current}
                pages={multiPage.pages}
                activePageId={multiPage.activePageId}
                onPageChange={(id) => multiPage.switchPage(id, editorRef.current)}
                onPageCreate={() => { if (!readOnly) multiPage.createPage(); }}
                onPageDelete={(id) => { if (!readOnly) multiPage.deletePage(id); }}
                onPageRename={(id, name) => { if (!readOnly) multiPage.renamePage(id, name); }}
              />
            )}

            {/* ── LAYERS TAB ─────────────────────────────────────────────── */}
            {activeTab === 'layers' && (
              <NavigatorPanel editor={editorReady ? editorRef.current : null} />
            )}

            {/* ── IMPORT TAB ─────────────────────────────────────────────── */}
            {activeTab === 'import' && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: '0 0 12px 0' }}>
                  Event Data Binding
                </p>
                <ImportDataPanel
                  status={eventImport.status}
                  snapshot={eventImport.snapshot}
                  importedAt={eventImport.importedAt}
                  disconnectedAt={eventImport.disconnectedAt}
                  notice={dataNotice}
                  onImport={handleFetchEventData}
                  onDisconnect={handleDisconnect}
                  onReconnect={handleFetchEventData}
                />
              </div>
            )}

            {activeTab === 'assets' && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: '0 0 12px 0' }}>
                  Asset Library
                </p>
                <AssetLibraryPanel assets={assets} onAssetInsert={handleAssetInsert} onAssetSave={handleAssetSave} onSearchImages={onSearchImages} onUploadAsset={onUploadAsset} />
              </div>
            )}
          </div>
        </aside>

        {/* Center Canvas */}
        <main
          className="gjs-studio-canvas-container"
          onDragOver={(e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rawData = e.dataTransfer?.getData('application/x-eventos-builder-drag');
            let item: { type: 'template' | 'asset'; data: any; rawItem?: any } | null = null;
            if (rawData) {
              try { item = JSON.parse(rawData); } catch {}
            }
            if (!item && (window as any).__wb_dragged_item__) {
              item = (window as any).__wb_dragged_item__;
            }
            (window as any).__wb_dragged_item__ = null;
            if (!item) return;

            if (item.type === 'template') {
              insertDroppedItemRef.current.handleTemplate?.(item.data);
            } else if (item.type === 'asset') {
              if (item.data.type === 'svg' && !item.data.svg && item.rawItem) {
                try {
                  item.data.svg = await renderUndrawSvg(item.rawItem, resolvedTheme.primary || '#6c63ff');
                } catch {}
              }
              insertDroppedItemRef.current.handleAsset?.(item.data);
            }
          }}
        >
          <div ref={containerRef} id="gjs-canvas" />
        </main>

        {/* Right Inspector Sidebar */}
        {hasSelectedComponent && rightInspectorCollapsed ? (
          <aside className="wb-inspector-collapsed" aria-label="Collapsed inspector">
            <button
              type="button"
              className="wb-collapsed-panel-btn"
              onClick={() => setRightInspectorCollapsed(false)}
              title="Show inspector"
              aria-label="Show inspector"
            >
              <PanelRightOpen size={16} />
              <span>Inspector</span>
            </button>
          </aside>
        ) : hasSelectedComponent ? (
          <aside className="gjs-studio-inspector">
            <PropertyStudio
              editor={editorRef.current}
              pages={multiPage.pages}
              eventStatus={dataNotice ? 'mock' : eventImport.status}
              onFetchEventData={handleFetchEventData}
              onCollapseInspector={() => setRightInspectorCollapsed(true)}
              readOnly={readOnly}
              device={device}
            />
          </aside>
        ) : null}
      </div>

      {/* ── Code Export Modal ─────────────────────────────────────────────── */}
      {publishModalOpen && (
        <div className="wb-publish-modal" role="dialog" aria-modal="true" aria-label="Publish settings">
          <div className="wb-publish-card">
            <div className="wb-publish-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Publish settings</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 12 }}>Choose where this website will be available.</p>
              </div>
              <button type="button" onClick={() => setPublishModalOpen(false)} className="gjs-action-btn gjs-action-btn-secondary">Close</button>
            </div>
            <div className="wb-publish-body">
              <label className="wb-publish-field">
                Application URL
                <input value={publishSlug} onChange={(event) => setPublishSlug(event.target.value)} className="wb-publish-input" placeholder="event-site" />
              </label>
              <div className="wb-publish-field">
                Default publish URL
                <input value={publishDefaultUrl} readOnly className="wb-publish-input" />
              </div>
              <label className="wb-publish-field">
                Custom domain
                <input value={publishCustomDomain} onChange={(event) => setPublishCustomDomain(event.target.value)} className="wb-publish-input" placeholder="www.your-event.com" />
              </label>
              <div style={{ border: '1px solid rgba(148, 163, 184, 0.14)', borderRadius: 8, padding: 12, color: 'var(--muted-foreground)', fontSize: 12, lineHeight: 1.5 }}>
                The application URL is available by default. Custom domains can be connected after DNS verification and TLS setup in the hosting layer.
              </div>
            </div>
            <div className="wb-publish-footer">
              <button type="button" onClick={() => setPublishModalOpen(false)} className="gjs-action-btn gjs-action-btn-secondary">Cancel</button>
              <button type="button" onClick={handleConfirmPublish} {...(isSaving ? { disabled: true } : {})} className="gjs-action-btn gjs-action-btn-primary">
                <Rocket size={15} /> {isSaving ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {codeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 24 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border-strong, rgba(255,255,255,0.15))', borderRadius: 20, width: '100%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--foreground)', fontSize: 18, fontWeight: 800 }}>Export Code</h3>
                <p style={{ margin: '4px 0 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                  Page: <strong style={{ color: 'var(--muted-foreground)' }}>{multiPage.activePage?.name}</strong>
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(`<!DOCTYPE html>\n<html>\n<head><style>${exportedCode.css}</style></head>\n<body>${exportedCode.html}</body>\n</html>`)}
                  style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)', color: 'var(--primary)', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                >
                  Copy All
                </button>
                <button onClick={() => setCodeModalOpen(false)} style={{ background: 'var(--border-subtle, rgba(255,255,255,0.06))', border: '1px solid var(--border-default, rgba(255,255,255,0.1))', color: 'var(--muted-foreground)', padding: '8px 14px', borderRadius: 8, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ color: 'var(--primary)', margin: 0, fontSize: 13, fontWeight: 700 }}>HTML Output</h4>
                  <button onClick={() => navigator.clipboard.writeText(exportedCode.html)} style={{ background: 'transparent', border: '1px solid var(--border-default, rgba(255,255,255,0.1))', color: 'var(--muted-foreground)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Copy</button>
                </div>
                <textarea readOnly value={exportedCode.html} style={{ width: '100%', height: 200, background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12, boxSizing: 'border-box', resize: 'none' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ color: 'var(--primary)', margin: 0, fontSize: 13, fontWeight: 700 }}>CSS Styles</h4>
                  <button onClick={() => navigator.clipboard.writeText(exportedCode.css)} style={{ background: 'transparent', border: '1px solid var(--border-default, rgba(255,255,255,0.1))', color: 'var(--muted-foreground)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Copy</button>
                </div>
                <textarea readOnly value={exportedCode.css} style={{ width: '100%', height: 160, background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12, boxSizing: 'border-box', resize: 'none' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
