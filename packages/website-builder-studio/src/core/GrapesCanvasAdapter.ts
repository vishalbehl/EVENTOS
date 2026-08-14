import type { Editor } from 'grapesjs';
import type { PageConfig, WebsiteDocument, WebsiteProjectData } from '../types';
import { normalizeLegacyComponentTypes } from '../hooks/useMultiPage';
import { projectDataFromWebsiteDocument, websiteDocumentPageToGrapesComponents } from './documentModel';
import { applyComponentSettings } from './components/componentRenderers';

export const WB_INSTANCE_ID_ATTR = 'data-wb-instance-id';

function generateInstanceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `inst_${crypto.randomUUID()}`;
  return `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureComponentInstanceIds(editor: Editor): void {
  if (!editor || typeof editor.getComponents !== 'function') return;
  const visit = (component: any) => {
    if (!component) return;
    const attrs = typeof component.getAttributes === 'function' ? component.getAttributes() : {};
    if (!attrs?.[WB_INSTANCE_ID_ATTR] && typeof component.addAttributes === 'function') {
      component.addAttributes({ [WB_INSTANCE_ID_ATTR]: generateInstanceId() });
    }
    const children = typeof component.components === 'function' ? component.components() : null;
    if (children && typeof children.forEach === 'function') children.forEach((child: any) => visit(child));
  };
  editor.getComponents().forEach((component: any) => visit(component));
}

function applyRegisteredComponentRenderers(editor: Editor): boolean {
  if (!editor || typeof editor.getComponents !== 'function') return false;
  const before = safeEditorRead('', () => JSON.stringify(editor.getComponents().toJSON()));
  const visit = (component: any) => {
    if (!component) return;
    applyComponentSettings(component);
    const children = typeof component.components === 'function' ? component.components() : null;
    if (children && typeof children.forEach === 'function') children.forEach((child: any) => visit(child));
  };
  editor.getComponents().forEach((component: any) => visit(component));
  ensureComponentInstanceIds(editor);
  const after = safeEditorRead('', () => JSON.stringify(editor.getComponents().toJSON()));
  return before !== after;
}

function safeEditorRead<T>(fallback: T, read: () => T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function serializeActivePage(editor: Editor, document: WebsiteDocument, activePageId: string): PageConfig[] {
  ensureComponentInstanceIds(editor);
  const project = projectDataFromWebsiteDocument(document);
  const pages = project.pages || [];
  return pages.map(page => page.id === activePageId
    ? {
        ...page,
        html: safeEditorRead(page.html, () => editor.getHtml()),
        css: safeEditorRead(page.css, () => editor.getCss() || ''),
        components: normalizeLegacyComponentTypes(safeEditorRead(page.components, () => editor.getComponents().toJSON())),
        styles: normalizeLegacyComponentTypes(safeEditorRead(page.styles, () => editor.getStyle())),
        updatedAt: new Date().toISOString(),
      }
    : page);
}

export interface GrapesCanvasAdapter {
  renderPage: (document: WebsiteDocument, pageId: string) => void;
  snapshotActivePage: (document: WebsiteDocument, activePageId: string) => WebsiteProjectData;
  destroy: () => void;
}

export function createGrapesCanvasAdapter(
  editor: Editor,
  callbacks: {
    getDocument: () => WebsiteDocument | null;
    getActivePageId: () => string;
    getDevice: () => 'desktop' | 'tablet' | 'mobile';
    onCanvasDocumentChange: (project: WebsiteProjectData) => void;
    onSelectionChange: (instanceId?: string) => void;
    onAfterRender?: () => void;
  },
): GrapesCanvasAdapter {
  let applyingDocument = false;
  let dragging = false;
  let destroyed = false;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let afterRenderTimer: ReturnType<typeof setTimeout> | undefined;

  const snapshotActivePage = (document: WebsiteDocument, activePageId: string): WebsiteProjectData => {
    const project = projectDataFromWebsiteDocument(document);
    if (destroyed || !editor || typeof editor.getComponents !== 'function') {
      return { ...project, activePageId, editorDevice: callbacks.getDevice() };
    }
    const pages = project.pages || [];
    return {
      ...project,
      pages: serializeActivePage(editor, document, activePageId),
      activePageId,
      editorDevice: callbacks.getDevice(),
      html: pages.find(page => page.isHomePage)?.html || project.html,
      css: pages.find(page => page.isHomePage)?.css || project.css,
      updatedAt: new Date().toISOString(),
    };
  };

  const flushCanvasToDocument = () => {
    if (destroyed || applyingDocument || dragging) return;
    const document = callbacks.getDocument();
    const activePageId = callbacks.getActivePageId();
    if (!document || !activePageId) return;
    callbacks.onCanvasDocumentChange(snapshotActivePage(document, activePageId));
  };

  const scheduleFlush = () => {
    if (destroyed || applyingDocument || dragging) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(flushCanvasToDocument, 450);
  };

  const handleSelection = (selected?: any) => {
    const attrs = selected?.getAttributes?.() as Record<string, string> | undefined;
    callbacks.onSelectionChange(attrs?.[WB_INSTANCE_ID_ATTR]);
  };
  const handleDeselection = () => callbacks.onSelectionChange(undefined);
  const handleDragStart = () => { dragging = true; };
  const handleDragEnd = () => {
    dragging = false;
    scheduleFlush();
  };

  const renderPage = (document: WebsiteDocument, pageId: string) => {
    if (destroyed || !editor || typeof editor.setComponents !== 'function') return;
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = undefined;
    }
    applyingDocument = true;
    let rendererChangedDocument = false;
    try {
      const page = document.pages.find(candidate => candidate.id === pageId) || document.pages.find(candidate => candidate.isHomePage) || document.pages[0];
      const root = page ? document.instances[page.rootInstanceId] : undefined;
      const components = websiteDocumentPageToGrapesComponents(document, pageId, callbacks.getDevice());
      editor.setStyle('');
      if (components.length) editor.setComponents(components as any);
      else if (typeof root?.props.legacyHtml === 'string') editor.setComponents(root.props.legacyHtml);
      else editor.setComponents('');
      if (typeof root?.props.legacyCss === 'string' && root.props.legacyCss.trim()) {
        editor.setStyle(root.props.legacyCss);
      }
      ensureComponentInstanceIds(editor);
      rendererChangedDocument = applyRegisteredComponentRenderers(editor);
      callbacks.onAfterRender?.();
    } finally {
      afterRenderTimer = setTimeout(() => {
        if (destroyed) return;
        applyingDocument = false;
        if (rendererChangedDocument) flushCanvasToDocument();
        callbacks.onAfterRender?.();
        callbacks.onSelectionChange(undefined);
      }, 0);
    }
  };

  const events = [
    'component:add',
    'component:update',
    'component:remove',
    'component:styleUpdate',
    'style:property:update',
  ];
  events.forEach(eventName => editor.on(eventName, scheduleFlush));
  editor.on('component:drag:start', handleDragStart);
  editor.on('component:drag:end', handleDragEnd);
  editor.on('component:selected', handleSelection);
  editor.on('component:deselected', handleDeselection);

  return {
    renderPage,
    snapshotActivePage,
    destroy: () => {
      destroyed = true;
      if (syncTimer) clearTimeout(syncTimer);
      if (afterRenderTimer) clearTimeout(afterRenderTimer);
      events.forEach(eventName => editor.off(eventName, scheduleFlush));
      editor.off('component:drag:start', handleDragStart);
      editor.off('component:drag:end', handleDragEnd);
      editor.off('component:selected', handleSelection);
      editor.off('component:deselected', handleDeselection);
    },
  };
}
