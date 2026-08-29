import { describe, expect, it } from 'vitest';
import type { WebsiteDocument } from '../../types';
import { sanitizeSvg } from '../svgSanitizer';
import { canDeleteAsset, findAssetReferencesInDocument } from '../assetManager';
import { createSvgAsset, UNDRAW_CATALOG } from '../assetLibrary';

const mockDocWithAssets: WebsiteDocument = {
  schemaVersion: 1,
  site: { siteName: 'Asset Test Site' },
  pages: [
    {
      id: 'page_home',
      name: 'Home',
      slug: '',
      isHomePage: true,
      rootInstanceId: 'root_home',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    },
    {
      id: 'page_about',
      name: 'About',
      slug: 'about',
      isHomePage: false,
      rootInstanceId: 'root_about',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    },
  ],
  instances: {
    root_home: {
      id: 'root_home',
      componentType: 'page-root',
      componentVersion: 1,
      children: ['hero_img', 'bg_section'],
      props: { pageId: 'page_home' },
      styles: {},
      bindings: [],
      states: {},
    },
    hero_img: {
      id: 'hero_img',
      componentType: 'image',
      componentVersion: 1,
      parentId: 'root_home',
      children: [],
      props: {
        attributes: {
          src: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
          alt: 'Conference Hall',
        },
      },
      styles: {},
      bindings: [],
      states: {},
    },
    bg_section: {
      id: 'bg_section',
      componentType: 'section',
      componentVersion: 1,
      parentId: 'root_home',
      children: [],
      props: { attributes: {} },
      styles: {
        desktop: {
          'background-image': 'url("https://cdn.eventos.io/assets/banner_123.jpg")',
        },
      },
      bindings: [],
      states: {},
    },
    root_about: {
      id: 'root_about',
      componentType: 'page-root',
      componentVersion: 1,
      children: ['about_cta'],
      props: { pageId: 'page_about' },
      styles: {},
      bindings: [],
      states: {},
    },
    about_cta: {
      id: 'about_cta',
      componentType: 'button',
      componentVersion: 1,
      parentId: 'root_about',
      children: [],
      props: {
        link: {
          type: 'file',
          url: 'https://cdn.eventos.io/docs/agenda_2026.pdf',
        },
      },
      styles: {},
      bindings: [],
      states: {},
    },
  },
  tokens: {
    theme: {
      primary: '#7c3aed',
      secondary: '#22d3ee',
      background: '#080912',
      surface: '#111827',
      card: '#151629',
    },
  },
  menus: [],
  assets: [
    {
      id: 'asset_hero',
      type: 'image',
      title: 'Conference Hall',
      url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
      savedAt: '2026-08-14T00:00:00.000Z',
    },
    {
      id: 'asset_unused',
      type: 'image',
      title: 'Unused Logo',
      url: 'https://cdn.eventos.io/assets/unused_logo.png',
      savedAt: '2026-08-14T00:00:00.000Z',
    },
  ],
  dataSources: [],
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
};

describe('Phase 7: SVG Sanitization Security', () => {
  it('strips script tags and inline on* event handlers', () => {
    const maliciousSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <script>alert('XSS')</script>
      <circle cx="50" cy="50" r="40" fill="red" onload="alert(1)" onclick="alert(2)" />
    </svg>`;

    const cleaned = sanitizeSvg(maliciousSvg);
    expect(cleaned).not.toContain('<script');
    expect(cleaned).not.toContain('alert');
    expect(cleaned).not.toContain('onload');
    expect(cleaned).not.toContain('onclick');
    expect(cleaned).toContain('<circle cx="50" cy="50" r="40" fill="red"');
  });

  it('neutralizes malicious javascript: and foreignObject tags', () => {
    const maliciousSvg = `<svg viewBox="0 0 100 100">
      <a href="javascript:alert('pwned')"><text>Click</text></a>
      <foreignObject width="100" height="50">
        <iframe src="http://evil.com"></iframe>
      </foreignObject>
      <path d="M10 10 H 90" stroke="black" />
    </svg>`;

    const cleaned = sanitizeSvg(maliciousSvg);
    expect(cleaned).not.toContain('javascript:alert');
    expect(cleaned).not.toContain('<foreignObject');
    expect(cleaned).not.toContain('<iframe');
    expect(cleaned).toContain('<path d="M10 10 H 90" stroke="black"');
  });
});

describe('Phase 7: Asset Reference Counting & Deletion Guard', () => {
  it('finds active asset references across instance attributes, styles, and links', () => {
    // 1. Image attribute
    const imgRefs = findAssetReferencesInDocument(
      mockDocWithAssets,
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
    );
    expect(imgRefs).toHaveLength(1);
    expect(imgRefs[0].pageName).toBe('Home');
    expect(imgRefs[0].instanceId).toBe('hero_img');

    // 2. CSS background-image
    const bgRefs = findAssetReferencesInDocument(
      mockDocWithAssets,
      'https://cdn.eventos.io/assets/banner_123.jpg',
    );
    expect(bgRefs).toHaveLength(1);
    expect(bgRefs[0].pageName).toBe('Home');
    expect(bgRefs[0].instanceId).toBe('bg_section');

    // 3. Button file download link on another page
    const docRefs = findAssetReferencesInDocument(
      mockDocWithAssets,
      'https://cdn.eventos.io/docs/agenda_2026.pdf',
    );
    expect(docRefs).toHaveLength(1);
    expect(docRefs[0].pageName).toBe('About');
    expect(docRefs[0].instanceId).toBe('about_cta');
  });

  it('prevents deletion of referenced assets and allows deletion of unreferenced assets', () => {
    const heroCheck = canDeleteAsset(
      mockDocWithAssets,
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
    );
    expect(heroCheck.allowed).toBe(false);
    expect(heroCheck.referenceCount).toBe(1);

    const unusedCheck = canDeleteAsset(
      mockDocWithAssets,
      'https://cdn.eventos.io/assets/unused_logo.png',
    );
    expect(unusedCheck.allowed).toBe(true);
    expect(unusedCheck.referenceCount).toBe(0);
  });
});

describe('Phase 7: unDraw & Openverse Attribution Metadata', () => {
  it('creates an unDraw SVG asset with valid license attribution and primary color', async () => {
    const firstIllustration = UNDRAW_CATALOG[0];
    const asset = await createSvgAsset(firstIllustration, '#7c3aed');

    expect(asset.type).toBe('svg');
    expect(asset.title).toBe(firstIllustration.title);
    expect(asset.source).toBe('undraw');
    expect(asset.license).toContain('unDraw');
    expect(asset.svg).toContain('<svg');
    expect(asset.svg).toContain('fill="#7c3aed"');
  });
});
