import { describe, expect, it } from 'vitest';
import type { WebsiteDocument } from '../../types';
import { exportWebsiteBundle, renderWebsiteDocument } from '../websiteDocumentRenderer';
import { checksumWebsiteDocument } from '../documentModel';

const multiPageDoc: WebsiteDocument = {
  schemaVersion: 1,
  site: {
    siteName: 'Global AI Summit 2026',
    globalCSS: '.custom-header { font-weight: 700; }',
  },
  pages: [
    {
      id: 'page_home',
      name: 'Home',
      slug: '',
      isHomePage: true,
      rootInstanceId: 'root_home',
      seoTitle: 'Global AI Summit 2026 - Official Site',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    },
    {
      id: 'page_speakers',
      name: 'Speakers',
      slug: 'speakers',
      isHomePage: false,
      rootInstanceId: 'root_speakers',
      seoTitle: 'Keynote Speakers | Global AI Summit 2026',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    },
    {
      id: 'page_tickets',
      name: 'Tickets & Pricing',
      slug: 'tickets-pricing',
      isHomePage: false,
      rootInstanceId: 'root_tickets',
      seoTitle: 'Tickets & Passes | Global AI Summit 2026',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    },
  ],
  instances: {
    root_home: {
      id: 'root_home',
      componentType: 'page-root',
      componentVersion: 1,
      children: ['heading_home'],
      props: { pageId: 'page_home' },
      styles: {
        desktop: { background: '#080912' },
        tablet: { padding: '32px' },
        mobile: { padding: '16px' },
      },
      bindings: [],
      states: {},
    },
    heading_home: {
      id: 'heading_home',
      componentType: 'heading',
      componentVersion: 1,
      parentId: 'root_home',
      children: [],
      props: {
        tagName: 'h1',
        content: 'Welcome to Global AI Summit',
      },
      styles: {
        desktop: { color: '#ffffff' },
      },
      bindings: [],
      states: {},
    },
    root_speakers: {
      id: 'root_speakers',
      componentType: 'page-root',
      componentVersion: 1,
      children: ['heading_speakers'],
      props: { pageId: 'page_speakers' },
      styles: {},
      bindings: [],
      states: {},
    },
    heading_speakers: {
      id: 'heading_speakers',
      componentType: 'heading',
      componentVersion: 1,
      parentId: 'root_speakers',
      children: [],
      props: {
        tagName: 'h1',
        content: 'World Class Keynote Speakers',
      },
      styles: {},
      bindings: [],
      states: {},
    },
    root_tickets: {
      id: 'root_tickets',
      componentType: 'page-root',
      componentVersion: 1,
      children: ['heading_tickets'],
      props: { pageId: 'page_tickets' },
      styles: {},
      bindings: [],
      states: {},
    },
    heading_tickets: {
      id: 'heading_tickets',
      componentType: 'heading',
      componentVersion: 1,
      parentId: 'root_tickets',
      children: [],
      props: {
        tagName: 'h1',
        content: 'Passes & Registration',
      },
      styles: {},
      bindings: [],
      states: {},
    },
  },
  tokens: {
    theme: {
      primary: '#6366f1',
      secondary: '#ec4899',
      background: '#080912',
      surface: '#111827',
      card: '#151629',
    },
  },
  menus: [],
  assets: [],
  dataSources: [],
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
};

describe('Phase 10: Production Publishing & Multi-Page Export', () => {
  it('bundles multi-page static exports with canonical routes and artifact paths', () => {
    const bundle = exportWebsiteBundle(multiPageDoc);
    expect(bundle.diagnostics).toEqual([]);
    expect(bundle.siteName).toBe('Global AI Summit 2026');
    expect(bundle.pages).toHaveLength(3);

    const [home, speakers, tickets] = bundle.pages;

    // Home page mapping
    expect(home.route).toBe('/');
    expect(home.artifactPath).toBe('index.html');
    expect(home.title).toBe('Global AI Summit 2026 - Official Site');
    expect(home.html).toContain('Welcome to Global AI Summit</h1>');
    expect(home.html).toContain('--primary: #6366f1');
    expect(home.html).toContain('<script>(0,eval)');

    // Sub-page 1: Speakers
    expect(speakers.route).toBe('/speakers');
    expect(speakers.artifactPath).toBe('speakers/index.html');
    expect(speakers.title).toBe('Keynote Speakers | Global AI Summit 2026');
    expect(speakers.html).toContain('World Class Keynote Speakers</h1>');

    // Sub-page 2: Tickets
    expect(tickets.route).toBe('/tickets-pricing');
    expect(tickets.artifactPath).toBe('tickets-pricing/index.html');
    expect(tickets.title).toBe('Tickets & Passes | Global AI Summit 2026');
    expect(tickets.html).toContain('Passes &amp; Registration</h1>');
  });

  it('preserves checksum calculation across exports and individual page renders', () => {
    const docWithChecksum: WebsiteDocument = {
      ...multiPageDoc,
      checksum: checksumWebsiteDocument(multiPageDoc),
    };

    const bundle = exportWebsiteBundle(docWithChecksum);
    expect(bundle.checksum).toBe(docWithChecksum.checksum);

    // Export HTML is deterministic
    const export1 = renderWebsiteDocument(docWithChecksum, 'page_home', 'export');
    const export2 = renderWebsiteDocument(docWithChecksum, 'page_home', 'export');
    expect(export1.html).toBe(export2.html);
    expect(export1.css).toBe(export2.css);
  });
});
