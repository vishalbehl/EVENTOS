import { create } from 'zustand';
import { produce } from 'immer';
import type {
  BuilderLink,
  ComponentInstance,
  EventDataSnapshot,
  ResponsiveDevice,
  WebsiteAsset,
  WebsiteDocument,
  WebsiteProjectData,
} from '../types';
import {
  buildWebsiteDocumentFromProject,
  checksumWebsiteDocument,
  ensureWebsiteDocument,
  projectDataFromWebsiteDocument,
} from './documentModel';
import {
  disconnectInstanceFromEvent,
  reconnectInstanceToEvent,
} from './eventDataBinding';
import { mockEventSnapshot } from './eventMockData';

export interface CheckpointRecord {
  id: string;
  label: string;
  timestamp: string;
  document: WebsiteDocument;
}

type InstancePatch = Partial<Pick<ComponentInstance, 'props' | 'styles' | 'bindings' | 'states'>>;

interface WebsiteDocumentState {
  document: WebsiteDocument | null;
  activePageId: string;
  selectedInstanceId?: string;
  isDirty: boolean;
  checkpoints: CheckpointRecord[];
  markClean: () => void;
  createCheckpoint: (label?: string) => string;
  restoreCheckpoint: (checkpointId: string) => boolean;
  saveLocalRecovery: (key?: string) => void;
  loadLocalRecovery: (key?: string) => boolean;
  clearLocalRecovery: (key?: string) => void;
  initialize: (project?: WebsiteProjectData) => void;
  replaceDocument: (document: WebsiteDocument, activePageId?: string) => void;
  replaceActivePageFromProject: (project: WebsiteProjectData) => void;
  insertInstance: (parentId: string, instance: ComponentInstance, at?: number) => void;
  updateInstanceProps: (instanceId: string, props: Record<string, unknown>) => void;
  updateInstanceStyles: (instanceId: string, device: ResponsiveDevice, styles: Record<string, string>) => void;
  updateInstance: (instanceId: string, patch: InstancePatch) => void;
  moveInstance: (instanceId: string, nextParentId: string, at?: number) => void;
  duplicateInstance: (instanceId: string) => void;
  deleteInstance: (instanceId: string) => void;
  selectInstance: (instanceId?: string) => void;
  createPage: (name?: string) => void;
  switchPage: (pageId: string) => void;
  renamePage: (pageId: string, name: string) => void;
  deletePage: (pageId: string) => void;
  upsertAsset: (asset: WebsiteAsset) => void;
  updateLink: (instanceId: string, link: BuilderLink) => void;
  disconnectInstanceEvent: (instanceId: string) => void;
  reconnectInstanceEvent: (instanceId: string, snapshot?: EventDataSnapshot) => void;
  toProjectData: () => WebsiteProjectData;
}

function now() {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cloneInstanceTree(document: WebsiteDocument, instanceId: string, parentId?: string): string | undefined {
  const source = document.instances[instanceId];
  if (!source) return undefined;
  const nextId = generateId('inst');
  const children = source.children
    .map(childId => cloneInstanceTree(document, childId, nextId))
    .filter((childId): childId is string => Boolean(childId));
  document.instances[nextId] = {
    ...JSON.parse(JSON.stringify(source)),
    id: nextId,
    parentId,
    children,
  };
  return nextId;
}

function removeInstanceTree(document: WebsiteDocument, instanceId: string): void {
  const source = document.instances[instanceId];
  if (!source) return;
  source.children.forEach(childId => removeInstanceTree(document, childId));
  delete document.instances[instanceId];
}

function collectInstanceTree(document: WebsiteDocument, instanceId: string, ids = new Set<string>()): Set<string> {
  const instance = document.instances[instanceId];
  if (!instance || ids.has(instanceId)) return ids;
  ids.add(instanceId);
  instance.children.forEach(childId => collectInstanceTree(document, childId, ids));
  return ids;
}

function mergeCanvasInstance(
  existing: ComponentInstance | undefined,
  incoming: ComponentInstance,
  device: ResponsiveDevice,
): ComponentInstance {
  const existingAttributes = existing?.props.attributes;
  const incomingAttributes = incoming.props.attributes;
  const attributes = {
    ...(existingAttributes && typeof existingAttributes === 'object' && !Array.isArray(existingAttributes)
      ? existingAttributes as Record<string, unknown>
      : {}),
    ...(incomingAttributes && typeof incomingAttributes === 'object' && !Array.isArray(incomingAttributes)
      ? incomingAttributes as Record<string, unknown>
      : {}),
  };

  return {
    ...incoming,
    componentVersion: existing?.componentVersion || incoming.componentVersion,
    props: {
      ...(existing?.props || {}),
      ...incoming.props,
      attributes,
    },
    styles: device === 'desktop' ? {
      ...(existing?.styles || {}),
      desktop: { ...(incoming.styles.desktop || {}) },
    } : {
      ...(existing?.styles || {}),
      desktop: { ...(existing?.styles.desktop || {}) },
      [device]: { ...(incoming.styles.desktop || {}) },
    },
    bindings: existing?.bindings || incoming.bindings,
    states: { ...(existing?.states || {}), ...incoming.states },
  };
}

function finalizeDocument(document: WebsiteDocument, draft?: { isDirty?: boolean }): void {
  document.updatedAt = now();
  const { checksum: _checksum, ...withoutChecksum } = document;
  document.checksum = checksumWebsiteDocument(withoutChecksum);
  if (draft) draft.isDirty = true;
}

function createStarterPageSection(document: WebsiteDocument, pageId: string, rootInstanceId: string, pageName: string): string {
  const sectionId = generateId('inst');
  const containerId = generateId('inst');
  const headingId = generateId('inst');
  const paragraphId = generateId('inst');

  document.instances[sectionId] = {
    id: sectionId,
    componentType: 'section',
    componentVersion: 1,
    parentId: rootInstanceId,
    children: [containerId],
    props: {
      tagName: 'section',
      attributes: { 'data-gjs-type': 'section', 'data-page-starter': pageId },
    },
    styles: {
      desktop: {
        'min-height': '68vh',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        padding: '96px 32px',
        background: 'linear-gradient(135deg, var(--background) 0%, var(--surface, var(--background)) 100%)',
        color: 'var(--foreground)',
        'box-sizing': 'border-box',
      },
    },
    bindings: [],
    states: {},
  };

  document.instances[containerId] = {
    id: containerId,
    componentType: 'container',
    componentVersion: 1,
    parentId: sectionId,
    children: [headingId, paragraphId],
    props: {
      tagName: 'div',
      attributes: { 'data-gjs-type': 'container' },
    },
    styles: {
      desktop: {
        width: '100%',
        'max-width': '920px',
        margin: '0 auto',
        'text-align': 'center',
      },
    },
    bindings: [],
    states: {},
  };

  document.instances[headingId] = {
    id: headingId,
    componentType: 'heading',
    componentVersion: 1,
    parentId: containerId,
    children: [],
    props: {
      tagName: 'h1',
      attributes: { 'data-gjs-type': 'heading' },
      content: pageName,
    },
    styles: {
      desktop: {
        margin: '0 0 16px',
        color: 'var(--foreground)',
        'font-size': '48px',
        'font-weight': '900',
        'line-height': '1.08',
      },
    },
    bindings: [],
    states: {},
  };

  document.instances[paragraphId] = {
    id: paragraphId,
    componentType: 'paragraph',
    componentVersion: 1,
    parentId: containerId,
    children: [],
    props: {
      tagName: 'p',
      attributes: { 'data-gjs-type': 'paragraph' },
      content: 'This page is ready. Add sections, link buttons, or replace this starter content.',
    },
    styles: {
      desktop: {
        margin: '0 auto',
        color: 'var(--muted-foreground)',
        'font-size': '18px',
        'line-height': '1.65',
        'max-width': '640px',
      },
    },
    bindings: [],
    states: {},
  };

  return sectionId;
}

const memoryRecoveryStorage = new Map<string, string>();

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Fallback to memory
  }
  return memoryRecoveryStorage.get(key) || null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch {
    // Fallback to memory
  }
  memoryRecoveryStorage.set(key, value);
}

function removeStorageItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Fallback to memory
  }
  memoryRecoveryStorage.delete(key);
}

export const useWebsiteDocumentStore = create<WebsiteDocumentState>((set, get) => ({
  document: null,
  activePageId: '',
  selectedInstanceId: undefined,
  isDirty: false,
  checkpoints: [],

  markClean: () => set({ isDirty: false }),

  createCheckpoint: (label = 'Manual Checkpoint') => {
    const doc = get().document;
    if (!doc) return '';
    const id = generateId('chk');
    const checkpoint: CheckpointRecord = {
      id,
      label,
      timestamp: new Date().toISOString(),
      document: JSON.parse(JSON.stringify(doc)),
    };
    set(state => ({
      checkpoints: [checkpoint, ...state.checkpoints].slice(0, 30),
    }));
    return id;
  },

  restoreCheckpoint: (checkpointId: string) => {
    const target = get().checkpoints.find(c => c.id === checkpointId);
    if (!target) return false;
    get().replaceDocument(JSON.parse(JSON.stringify(target.document)));
    set({ isDirty: true });
    return true;
  },

  saveLocalRecovery: (key = 'wb_local_recovery_draft') => {
    const doc = get().document;
    if (!doc) return;
    setStorageItem(key, JSON.stringify({
      document: doc,
      activePageId: get().activePageId,
      savedAt: new Date().toISOString(),
    }));
  },

  loadLocalRecovery: (key = 'wb_local_recovery_draft') => {
    try {
      const raw = getStorageItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.document) {
        get().replaceDocument(parsed.document, parsed.activePageId);
        set({ isDirty: true });
        return true;
      }
    } catch {
      return false;
    }
    return false;
  },

  clearLocalRecovery: (key = 'wb_local_recovery_draft') => {
    removeStorageItem(key);
  },

  initialize: (project) => {
    const document = ensureWebsiteDocument(project || { name: 'Untitled website' });
    const activePageId = project?.activePageId || document.pages.find(page => page.isHomePage)?.id || document.pages[0]?.id || '';
    set({ document, activePageId, selectedInstanceId: undefined, isDirty: false });
  },

  replaceDocument: (document, activePageId) => {
    set({
      document,
      activePageId: activePageId || document.pages.find(page => page.isHomePage)?.id || document.pages[0]?.id || '',
      selectedInstanceId: undefined,
      isDirty: false,
    });
  },

  replaceActivePageFromProject: (project) => {
    set(state => produce(state, draft => {
      if (!draft.document) return;
      const activePageId = project.activePageId || draft.activePageId;
      const editorDevice = project.editorDevice || 'desktop';
      const currentPage = draft.document.pages.find(page => page.id === activePageId);
      const incomingPage = project.pages?.find(page => page.id === activePageId);
      if (!currentPage || !incomingPage) return;

      const imported = buildWebsiteDocumentFromProject({
        name: draft.document.site.siteName,
        pages: [incomingPage],
        activePageId,
        updatedAt: now(),
      });
      const importedPage = imported.pages[0];
      const importedRoot = imported.instances[importedPage.rootInstanceId];
      const currentRoot = draft.document.instances[currentPage.rootInstanceId];
      if (!importedRoot || !currentRoot) return;

      const previousTree = collectInstanceTree(draft.document as WebsiteDocument, currentPage.rootInstanceId);
      const nextTree = collectInstanceTree(imported, importedPage.rootInstanceId);

      nextTree.forEach(instanceId => {
        const incoming = imported.instances[instanceId];
        const existing = draft.document?.instances[instanceId] as ComponentInstance | undefined;
        if (!incoming || !draft.document) return;
        draft.document.instances[instanceId] = mergeCanvasInstance(existing, incoming, editorDevice);
      });

      previousTree.forEach(instanceId => {
        if (instanceId !== currentPage.rootInstanceId && !nextTree.has(instanceId)) {
          delete draft.document?.instances[instanceId];
        }
      });

      currentRoot.children = [...importedRoot.children];
      currentRoot.props = {
        ...currentRoot.props,
        legacyHtml: incomingPage.components ? undefined : incomingPage.html,
        legacyCss: incomingPage.css,
      };
      currentPage.updatedAt = now();
      draft.activePageId = activePageId;
      finalizeDocument(draft.document, draft);
    }));
  },

  insertInstance: (parentId, instance, at) => set(state => produce(state, draft => {
    if (!draft.document || !draft.document.instances[parentId]) return;
    draft.document.instances[instance.id] = { ...instance, parentId };
    const children = draft.document.instances[parentId].children;
    const index = typeof at === 'number' ? Math.max(0, Math.min(at, children.length)) : children.length;
    children.splice(index, 0, instance.id);
    finalizeDocument(draft.document, draft);
  })),

  updateInstanceProps: (instanceId, props) => get().updateInstance(instanceId, { props }),

  updateInstanceStyles: (instanceId, device, styles) => set(state => produce(state, draft => {
    const instance = draft.document?.instances[instanceId];
    if (!draft.document || !instance) return;
    instance.styles[device] = { ...(instance.styles[device] || {}), ...styles };
    finalizeDocument(draft.document, draft);
  })),

  updateInstance: (instanceId, patch) => set(state => produce(state, draft => {
    const instance = draft.document?.instances[instanceId];
    if (!draft.document || !instance) return;
    if (patch.props) instance.props = { ...instance.props, ...patch.props };
    if (patch.styles) instance.styles = { ...instance.styles, ...patch.styles };
    if (patch.bindings) instance.bindings = patch.bindings;
    if (patch.states) instance.states = { ...instance.states, ...patch.states };
    finalizeDocument(draft.document, draft);
  })),

  moveInstance: (instanceId, nextParentId, at) => set(state => produce(state, draft => {
    const document = draft.document;
    if (!document || !document.instances[instanceId] || !document.instances[nextParentId]) return;
    const currentParentId = document.instances[instanceId].parentId;
    if (currentParentId && document.instances[currentParentId]) {
      document.instances[currentParentId].children = document.instances[currentParentId].children.filter(childId => childId !== instanceId);
    }
    const siblings = document.instances[nextParentId].children;
    const index = typeof at === 'number' ? Math.max(0, Math.min(at, siblings.length)) : siblings.length;
    siblings.splice(index, 0, instanceId);
    document.instances[instanceId].parentId = nextParentId;
    finalizeDocument(document, draft);
  })),

  duplicateInstance: (instanceId) => set(state => produce(state, draft => {
    const document = draft.document;
    const source = document?.instances[instanceId];
    if (!document || !source?.parentId || !document.instances[source.parentId]) return;
    const cloneId = cloneInstanceTree(document, instanceId, source.parentId);
    if (!cloneId) return;
    const siblings = document.instances[source.parentId].children;
    siblings.splice(siblings.indexOf(instanceId) + 1, 0, cloneId);
    finalizeDocument(document, draft);
  })),

  deleteInstance: (instanceId) => set(state => produce(state, draft => {
    const document = draft.document;
    const source = document?.instances[instanceId];
    if (!document || !source || source.states.requiredSlot) return;
    if (source.parentId && document.instances[source.parentId]) {
      document.instances[source.parentId].children = document.instances[source.parentId].children.filter(childId => childId !== instanceId);
    }
    removeInstanceTree(document, instanceId);
    if (draft.selectedInstanceId === instanceId) draft.selectedInstanceId = undefined;
    finalizeDocument(document, draft);
  })),

  selectInstance: (instanceId) => set({ selectedInstanceId: instanceId }),

  createPage: (name) => set(state => produce(state, draft => {
    if (!draft.document) return;
    const pageName = name || `Page ${draft.document.pages.length + 1}`;
    const pageId = generateId('page');
    const rootInstanceId = `root_${pageId}`;
    const starterSectionId = createStarterPageSection(draft.document, pageId, rootInstanceId, pageName);
    draft.document.instances[rootInstanceId] = {
      id: rootInstanceId,
      componentType: 'page-root',
      componentVersion: 1,
      children: [starterSectionId],
      props: { pageId },
      styles: {},
      bindings: [],
      states: { name: pageName, locked: true },
    };
    draft.document.pages.push({
      id: pageId,
      name: pageName,
      slug: generateSlug(pageName),
      isHomePage: false,
      rootInstanceId,
      createdAt: now(),
      updatedAt: now(),
    });
    finalizeDocument(draft.document, draft);
  })),

  switchPage: (pageId) => set({ activePageId: pageId, selectedInstanceId: undefined }),

  renamePage: (pageId, name) => set(state => produce(state, draft => {
    const page = draft.document?.pages.find(candidate => candidate.id === pageId);
    if (!draft.document || !page) return;
    const previousRoute = page.isHomePage ? '/' : `/${page.slug}`;
    page.name = name;
    page.slug = page.isHomePage ? '' : generateSlug(name);
    const nextRoute = page.isHomePage ? '/' : `/${page.slug}`;
    Object.values(draft.document.instances).forEach(instance => {
      const attributes = instance.props.attributes;
      if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return;
      const attrs = attributes as Record<string, unknown>;
      const href = typeof attrs.href === 'string' ? attrs.href : '';
      const [hrefRoute, hash = ''] = href.split('#', 2);
      if (attrs['data-page-id'] === pageId || hrefRoute === previousRoute) {
        attrs.href = `${nextRoute}${hash ? `#${hash}` : ''}`;
        attrs['data-link-type'] = 'page';
        attrs['data-page-id'] = pageId;
      }
    });
    draft.document.menus.forEach(menu => {
      menu.items.forEach(item => {
        if (item.pageId !== pageId) return;
        const hash = item.anchorId ? `#${item.anchorId}` : '';
        item.href = `${nextRoute}${hash}`;
      });
    });
    page.updatedAt = now();
    finalizeDocument(draft.document, draft);
  })),

  deletePage: (pageId) => set(state => produce(state, draft => {
    const document = draft.document;
    const page = document?.pages.find(candidate => candidate.id === pageId);
    if (!document || !page || page.isHomePage) return;
    const deletedRoute = `/${page.slug}`;
    Object.values(document.instances).forEach(instance => {
      const attributes = instance.props.attributes;
      if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return;
      const attrs = attributes as Record<string, unknown>;
      const hrefRoute = typeof attrs.href === 'string' ? attrs.href.split('#')[0] : '';
      if (attrs['data-page-id'] !== pageId && hrefRoute !== deletedRoute) return;
      delete attrs.href;
      delete attrs['data-link-type'];
      delete attrs['data-page-id'];
      delete attrs['data-anchor-id'];
      if (instance.props.link && typeof instance.props.link === 'object' && !Array.isArray(instance.props.link)) {
        delete instance.props.link;
      }
    });
    document.menus.forEach(menu => {
      menu.items = menu.items.filter(item => item.pageId !== pageId);
    });
    removeInstanceTree(document, page.rootInstanceId);
    document.pages = document.pages.filter(candidate => candidate.id !== pageId);
    if (draft.activePageId === pageId) draft.activePageId = document.pages[0]?.id || '';
    finalizeDocument(document, draft);
  })),

  upsertAsset: (asset) => set(state => produce(state, draft => {
    if (!draft.document) return;
    const index = draft.document.assets.findIndex(candidate => candidate.id === asset.id);
    if (index >= 0) draft.document.assets[index] = asset;
    else draft.document.assets.push(asset);
    finalizeDocument(draft.document, draft);
  })),

  updateLink: (instanceId, link) => set(state => produce(state, draft => {
    const document = draft.document;
    const instance = document?.instances[instanceId];
    if (!document || !instance) return;
    const attributes = {
      ...(instance.props.attributes && typeof instance.props.attributes === 'object' && !Array.isArray(instance.props.attributes)
        ? instance.props.attributes as Record<string, unknown>
        : {}),
    };
    instance.props.link = link;
    attributes['data-link-type'] = link.type;
    delete attributes['data-page-id'];
    delete attributes['data-anchor-id'];

    if (link.type === 'page') {
      const page = document.pages.find(p => p.id === link.pageId);
      const pageRoute = page ? (page.isHomePage ? '/' : `/${page.slug}`) : '/';
      const hash = link.anchorId ? `#${link.anchorId}` : '';
      attributes.href = `${pageRoute}${hash}`;
      attributes['data-page-id'] = link.pageId;
      if (link.anchorId) attributes['data-anchor-id'] = link.anchorId;
    } else if (link.type === 'anchor') {
      const anchor = link.anchorId || '';
      attributes.href = anchor.startsWith('#') ? anchor : `#${anchor}`;
      attributes['data-anchor-id'] = anchor.replace(/^#/, '');
    } else if (link.type === 'external') {
      attributes.href = link.url || link.href || '';
    } else if (link.type === 'email') {
      const email = link.email || link.href || '';
      attributes.href = email.startsWith('mailto:') ? email : `mailto:${email}`;
    } else if (link.type === 'phone') {
      const phone = link.phone || link.href || '';
      attributes.href = phone.startsWith('tel:') ? phone : `tel:${phone}`;
    } else if (link.type === 'file') {
      attributes.href = link.url || link.href || '';
    } else if (link.type === 'registration') {
      attributes.href = '/registration';
    } else if (link.type === 'speaker-portal') {
      attributes.href = '/speaker-portal';
    } else if (link.type === 'custom-route') {
      attributes.href = link.route || link.href || '';
    }
    instance.props.attributes = attributes;
    finalizeDocument(document, draft);
  })),

  disconnectInstanceEvent: (instanceId) => set(state => {
    if (!state.document) return state;
    const updated = disconnectInstanceFromEvent(state.document, instanceId);
    return { document: updated, isDirty: true };
  }),

  reconnectInstanceEvent: (instanceId, snapshot) => set(state => {
    if (!state.document) return state;
    const snap = snapshot || mockEventSnapshot;
    const updated = reconnectInstanceToEvent(state.document, instanceId, snap);
    return { document: updated, isDirty: true };
  }),

  toProjectData: () => {
    const document = get().document;
    if (!document) return { name: 'Untitled website' };
    return projectDataFromWebsiteDocument(document);
  },
}));


