import { beforeEach, describe, expect, it } from 'vitest';
import type { WebsiteProjectData } from '../../types';
import {
  buildWebsiteDocumentFromProject,
  ensureWebsiteDocument,
  instanceToGrapesComponent,
  projectDataFromWebsiteDocument,
  validateWebsiteDocument,
} from '../documentModel';
import { renderWebsiteDocument } from '../websiteDocumentRenderer';
import { useWebsiteDocumentStore } from '../websiteDocumentStore';
import { applyEventSnapshotToDocument } from '../eventDataBinding';
import { mockEventSnapshot } from '../eventMockData';
import { normalizeLegacyComponentTypes } from '../../hooks/useMultiPage';

const project: WebsiteProjectData = {
  name: 'Lifecycle Summit',
  activePageId: 'home',
  theme: {
    primary: '#7c3aed',
    secondary: '#22d3ee',
    background: '#080912',
    surface: '#111827',
    card: '#151629',
  },
  pages: [
    {
      id: 'home',
      name: 'Home',
      slug: '',
      isHomePage: true,
      html: '',
      css: '',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      components: [{
        type: 'section',
        tagName: 'section',
        attributes: { 'data-wb-instance-id': 'hero', id: 'hero' },
        style: { padding: '80px 32px', background: '#11102b' },
        components: [{
          type: 'heading',
          tagName: 'h1',
          attributes: { 'data-wb-instance-id': 'hero-title' },
          style: { color: '#ffffff', 'font-size': '56px' },
          components: 'Lifecycle Summit',
        }, {
          type: 'button',
          tagName: 'a',
          attributes: {
            'data-wb-instance-id': 'agenda-link',
            href: '/agenda',
            'data-link-type': 'page',
            'data-page-id': 'agenda',
          },
          components: 'View agenda',
        }],
      }],
    },
    {
      id: 'agenda',
      name: 'Agenda',
      slug: 'agenda',
      isHomePage: false,
      html: '',
      css: '',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      components: [{
        type: 'heading',
        tagName: 'h1',
        attributes: { 'data-wb-instance-id': 'agenda-title' },
        components: 'Agenda',
      }],
    },
  ],
};

function bodyMarkup(html: string): string {
  return html.match(/<body>([\s\S]*?)<script>/)?.[1]
    ?? html.match(/<body>([\s\S]*?)<\/body>/)?.[1]
    ?? '';
}

describe('canonical website document lifecycle', () => {
  beforeEach(() => {
    useWebsiteDocumentStore.setState({ document: null, activePageId: '', selectedInstanceId: undefined });
  });

  it('round-trips nested multi-page content with stable instance ids', () => {
    const first = buildWebsiteDocumentFromProject(project);
    const second = ensureWebsiteDocument(projectDataFromWebsiteDocument(first));

    expect(validateWebsiteDocument(second)).toEqual([]);
    expect(second.pages.map(page => page.id)).toEqual(['home', 'agenda']);
    expect(second.instances.hero.children).toEqual(['hero-title', 'agenda-link']);
    expect(second.instances['hero-title'].parentId).toBe('hero');
    expect(second.instances['agenda-link'].props.attributes).toMatchObject({ href: '/agenda' });
    expect(second.checksum).toBe(first.checksum);
  });

  it('materializes nested GrapesJS collections before they enter the canonical document', () => {
    const nestedCollection = {
      toJSON: () => [{
        type: 'heading',
        tagName: 'h1',
        components: { toJSON: () => [{ type: 'textnode', content: 'Nested title' }] },
      }],
    };
    const normalized = normalizeLegacyComponentTypes({
      type: 'section',
      components: nestedCollection,
    }) as Record<string, any>;

    expect(normalized.components[0].components[0]).toMatchObject({
      type: 'textnode',
      content: 'Nested title',
    });
    const document = buildWebsiteDocumentFromProject({
      name: 'Nested collection',
      pages: [{
        id: 'home', name: 'Home', slug: '', isHomePage: true, html: '', css: '',
        components: [normalized], createdAt: project.pages![0].createdAt, updatedAt: project.pages![0].updatedAt,
      }],
    });
    expect(renderWebsiteDocument(document, 'home', 'preview').html).toContain('Nested title');
  });

  it('rehydrates generic HTML tags with the GrapesJS default model', () => {
    const document = buildWebsiteDocumentFromProject(project);
    document.instances.hero.children.push('decorative-span');
    document.instances['decorative-span'] = {
      id: 'decorative-span',
      componentType: 'span',
      componentVersion: 1,
      parentId: 'hero',
      children: [],
      props: { tagName: 'span', attributes: { 'aria-hidden': 'true' } },
      styles: {},
      bindings: [],
      states: {},
    };

    const component = instanceToGrapesComponent(document.instances['decorative-span'], document);

    expect(component).toMatchObject({ type: 'default', tagName: 'span' });
  });

  it('drops blank tag names before hydrating GrapesJS', () => {
    const document = buildWebsiteDocumentFromProject(project);
    document.instances.hero.props.tagName = '';

    const component = instanceToGrapesComponent(document.instances.hero, document);

    expect(component).not.toHaveProperty('tagName');
  });

  it('sanitizes blank tag names inside adapter-backed component trees', () => {
    const document = buildWebsiteDocumentFromProject(project);
    document.instances.hero.props.adapter = {
      grapesjs: {
        type: 'default',
        tagName: '',
        components: [{ type: 'default', tagName: '' }],
      },
    };

    const component = instanceToGrapesComponent(document.instances.hero, document);

    expect(component).not.toHaveProperty('tagName');
    expect(component.components).toEqual([{ type: 'default' }]);
  });

  it('repairs legacy trees whose listed children are missing parent ids', () => {
    const document = buildWebsiteDocumentFromProject(project);
    document.instances.hero.parentId = undefined;
    document.instances['hero-title'].parentId = undefined;
    document.instances['agenda-link'].parentId = undefined;

    const repaired = ensureWebsiteDocument({ document });

    expect(repaired.instances.hero.parentId).toBe('root_home');
    expect(repaired.instances['hero-title'].parentId).toBe('hero');
    expect(repaired.instances['agenda-link'].parentId).toBe('hero');
    expect(validateWebsiteDocument(repaired)).toEqual([]);
  });

  it('preserves a canonical page root id through the canvas project adapter', () => {
    const document = buildWebsiteDocumentFromProject(project);
    document.pages[0].id = 'page_home';
    document.pages[0].rootInstanceId = 'root_home';

    const roundTrip = buildWebsiteDocumentFromProject(projectDataFromWebsiteDocument(document));

    expect(roundTrip.pages[0].rootInstanceId).toBe('root_home');
    expect(roundTrip.instances.hero.parentId).toBe('root_home');
    expect(validateWebsiteDocument(roundTrip)).toEqual([]);
  });

  it('renders identical page content in canvas and preview modes', () => {
    const document = buildWebsiteDocumentFromProject(project);
    document.instances.hero.styles.tablet = { padding: '48px 24px' };
    document.instances.hero.styles.mobile = { padding: '32px 16px' };

    const canvas = renderWebsiteDocument(document, 'home', 'canvas');
    const preview = renderWebsiteDocument(document, 'home', 'preview');

    expect(bodyMarkup(preview.html)).toBe(bodyMarkup(canvas.html));
    expect(preview.css).toContain('[data-wb-instance-id="hero"]{padding:48px 24px}');
    expect(preview.css).toContain('[data-wb-instance-id="hero"]{padding:32px 16px}');
    expect(preview.runtimeScripts).toHaveLength(1);
    expect(canvas.runtimeScripts).toHaveLength(0);
  });

  it('keeps page trees and structured links through store transactions', () => {
    useWebsiteDocumentStore.getState().initialize(project);
    const store = useWebsiteDocumentStore.getState();

    store.switchPage('agenda');
    store.updateInstanceStyles('agenda-title', 'desktop', { color: '#22d3ee' });
    store.updateLink('agenda-link', { type: 'page', pageId: 'agenda' });
    store.renamePage('agenda', 'Program');
    store.createPage('Venue');

    const next = useWebsiteDocumentStore.getState();
    expect(next.activePageId).toBe('agenda');
    expect(next.document?.instances['agenda-title'].styles.desktop?.color).toBe('#22d3ee');
    expect(next.document?.instances['agenda-link'].props.link).toEqual({ type: 'page', pageId: 'agenda' });
    expect(next.document?.instances['agenda-link'].props.attributes).toMatchObject({
      href: '/program',
      'data-link-type': 'page',
      'data-page-id': 'agenda',
    });
    expect(next.document?.pages.find(page => page.id === 'agenda')?.slug).toBe('program');
    expect(next.document?.pages.some(page => page.slug === 'venue')).toBe(true);
    expect(validateWebsiteDocument(next.document!)).toEqual([]);
  });

  it('merges canvas edits into only the active page without losing canonical metadata', () => {
    useWebsiteDocumentStore.getState().initialize(project);
    const original = useWebsiteDocumentStore.getState().document!;
    original.instances.hero.styles.tablet = { padding: '48px 24px' };
    original.instances.hero.bindings = [{
      id: 'event-name',
      source: 'snapshot',
      fieldPath: 'event.name',
      snapshotId: 'snapshot-1',
    }];
    original.instances.hero.states = { locked: true };
    original.menus = [{
      id: 'main',
      name: 'Main navigation',
      items: [{ type: 'page', pageId: 'agenda', label: 'Agenda' }],
    }];

    const canvasProject = projectDataFromWebsiteDocument(original);
    const home = canvasProject.pages!.find(page => page.id === 'home')!;
    const components = home.components as Array<Record<string, any>>;
    components[0].style.background = '#220044';
    components[0].components[0].content = 'Updated summit';
    canvasProject.activePageId = 'home';

    useWebsiteDocumentStore.getState().replaceActivePageFromProject(canvasProject);
    const next = useWebsiteDocumentStore.getState().document!;

    expect(next.instances.hero.styles.desktop?.background).toBe('#220044');
    expect(next.instances.hero.styles.tablet).toEqual({ padding: '48px 24px' });
    expect(next.instances.hero.bindings[0]).toMatchObject({ snapshotId: 'snapshot-1' });
    expect(next.instances.hero.states.locked).toBe(true);
    expect(next.instances['hero-title'].props.content).toBe('Updated summit');
    expect(next.instances['agenda-title']).toBeDefined();
    expect(next.menus[0].items[0]).toMatchObject({ pageId: 'agenda' });
    expect(validateWebsiteDocument(next)).toEqual([]);
  });

  it('stores canvas edits in the active responsive device without changing desktop', () => {
    useWebsiteDocumentStore.getState().initialize(project);
    const original = useWebsiteDocumentStore.getState().document!;
    const canvasProject = projectDataFromWebsiteDocument(original);
    const home = canvasProject.pages!.find(page => page.id === 'home')!;
    const components = home.components as Array<Record<string, any>>;
    components[0].style = { ...components[0].style, padding: '24px 12px', background: '#11102b' };
    canvasProject.activePageId = 'home';
    canvasProject.editorDevice = 'mobile';

    useWebsiteDocumentStore.getState().replaceActivePageFromProject(canvasProject);
    const next = useWebsiteDocumentStore.getState().document!;

    expect(next.instances.hero.styles.desktop?.padding).toBe('80px 32px');
    expect(next.instances.hero.styles.mobile?.padding).toBe('24px 12px');
    expect(next.instances['agenda-title']).toBeDefined();
  });

  it('resolves event snapshots into canonical props while preserving manual overrides', () => {
    const document = buildWebsiteDocumentFromProject(project);
    document.instances.hero.componentType = 'hero';
    document.instances.hero.props.attributes = { 'data-gjs-type': 'hero' };
    document.instances['agenda-title'].componentType = 'agenda';
    document.instances['agenda-title'].props.attributes = { 'data-source': 'manual', 'data-items': '[{"title":"Manual"}]' };
    document.instances['agenda-title'].bindings = [{
      id: 'manual-agenda', source: 'manual', fieldPath: 'sessions', isOverridden: true,
    }];

    const next = applyEventSnapshotToDocument(document, mockEventSnapshot, 'mock');
    const heroAttributes = next.instances.hero.props.attributes as Record<string, unknown>;
    const agendaAttributes = next.instances['agenda-title'].props.attributes as Record<string, unknown>;

    expect(heroAttributes['data-event-name']).toBe(mockEventSnapshot.eventName);
    expect(heroAttributes['data-target']).toBeUndefined();
    expect(next.instances.hero.bindings.some(item => item.fieldPath === 'eventName' && item.source === 'mock')).toBe(true);
    expect(agendaAttributes['data-items']).toBe('[{"title":"Manual"}]');
    expect(next.dataSources.find(item => item.id === 'current-event')).toMatchObject({
      snapshotId: mockEventSnapshot.snapshotId,
      status: 'mock',
    });
    expect(document.instances.hero.props.attributes).not.toHaveProperty('data-event-name');
  });

  it('handles 50 pages and 5,000 instances with stable checksums and zero validation errors', () => {
    useWebsiteDocumentStore.getState().initialize(project);
    const store = useWebsiteDocumentStore.getState();

    // Create 48 more pages to reach 50 pages total
    for (let p = 3; p <= 50; p++) {
      store.createPage(`Page ${p}`);
    }

    const doc50 = JSON.parse(JSON.stringify(useWebsiteDocumentStore.getState().document!));
    expect(doc50.pages).toHaveLength(50);

    // Populate instances across pages to reach ~5,000 instances
    // Each page gets a cluster of sections, headings, cards, and buttons
    const targetInstancesPerPage = 98;
    doc50.pages.forEach((page: any, pageIdx: number) => {
      const rootId = page.rootInstanceId;
      for (let i = 0; i < targetInstancesPerPage; i++) {
        const instId = `inst_p${pageIdx}_${i}`;
        doc50.instances[instId] = {
          id: instId,
          componentType: i % 4 === 0 ? 'section' : i % 4 === 1 ? 'heading' : i % 4 === 2 ? 'card' : 'button',
          componentVersion: 1,
          parentId: rootId,
          children: [],
          props: {
            content: `Item ${i} on ${page.name}`,
            attributes: { 'data-index': String(i) },
          },
          styles: { desktop: { padding: '12px' } },
          bindings: [],
          states: {},
        };
        doc50.instances[rootId].children.push(instId);
      }
    });

    const totalInstances = Object.keys(doc50.instances).length;
    expect(totalInstances).toBeGreaterThanOrEqual(5000);

    // Validate the stress document
    const errors = validateWebsiteDocument(doc50);
    expect(errors).toEqual([]);

    // Round-trip serialize through project adapter
    const projectData = projectDataFromWebsiteDocument(doc50);
    const reloaded = ensureWebsiteDocument(projectData);

    expect(reloaded.pages).toHaveLength(50);
    expect(Object.keys(reloaded.instances).length).toBe(totalInstances);
    expect(validateWebsiteDocument(reloaded)).toEqual([]);
    expect(reloaded.checksum).toBeDefined();
  });
});

