import { describe, expect, it } from 'vitest';
import type { WebsiteDocument } from '../../types';
import {
  buildResponsiveDocumentCss,
  renderWebsiteDocument,
} from '../websiteDocumentRenderer';
import { PREVIEW_RUNTIME_CSS, WEBSITE_RUNTIME_SCRIPT } from '../runtime';

const sampleInteractiveDoc: WebsiteDocument = {
  schemaVersion: 1,
  site: {
    siteName: 'Preview & Runtime Test Event',
    globalCSS: '.custom-global { color: #fff; }',
  },
  pages: [
    {
      id: 'page_home',
      name: 'Home',
      slug: '',
      isHomePage: true,
      rootInstanceId: 'root_home',
      seoTitle: 'Home | Tech Summit 2026',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    },
  ],
  instances: {
    root_home: {
      id: 'root_home',
      componentType: 'page-root',
      componentVersion: 1,
      children: ['countdown_1', 'tabs_1', 'form_1'],
      props: { pageId: 'page_home' },
      styles: {
        desktop: { background: '#080912' },
        tablet: { padding: '24px' },
        mobile: { padding: '12px' },
      },
      bindings: [],
      states: {},
    },
    countdown_1: {
      id: 'countdown_1',
      componentType: 'countdown',
      componentVersion: 1,
      parentId: 'root_home',
      children: [],
      props: {
        attributes: {
          'data-gjs-type': 'countdown',
          'data-target': '2026-12-31T23:59:59.000Z',
          'data-expired-message': 'Event Concluded',
        },
      },
      styles: {
        desktop: { 'font-size': '24px' },
        mobile: { 'font-size': '18px' },
      },
      bindings: [],
      states: {},
    },
    tabs_1: {
      id: 'tabs_1',
      componentType: 'tabs',
      componentVersion: 1,
      parentId: 'root_home',
      children: [],
      props: {
        attributes: {
          'data-wb-runtime': 'tabs',
          'data-tab-style': 'pills',
        },
      },
      styles: {},
      bindings: [],
      states: {},
    },
    form_1: {
      id: 'form_1',
      componentType: 'contact-form',
      componentVersion: 1,
      parentId: 'root_home',
      children: [],
      props: {
        tagName: 'form',
        attributes: {
          'data-gjs-type': 'contact-form',
          'data-wb-instance-id': 'form_1',
          'data-success-message': 'Message sent successfully!',
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
  assets: [],
  dataSources: [],
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
};

describe('Phase 8: Preview & Export Rendering Pipeline', () => {
  it('renders canvas mode without injecting runtime execution scripts', () => {
    const result = renderWebsiteDocument(sampleInteractiveDoc, 'page_home', 'canvas');
    expect(result.diagnostics).toEqual([]);
    expect(result.runtimeScripts).toEqual([]);
    expect(result.html).not.toContain('<script>(0,eval)');
    expect(result.html).toContain('<title>Home | Tech Summit 2026</title>');
  });

  it('renders preview mode with runtime CSS, SEO title, and embedded runtime script', () => {
    const result = renderWebsiteDocument(sampleInteractiveDoc, 'page_home', 'preview');
    expect(result.diagnostics).toEqual([]);
    expect(result.runtimeScripts).toHaveLength(1);
    expect(result.html).toContain('<script>(0,eval)(');
    expect(result.html).toContain('<title>Home | Tech Summit 2026</title>');
    expect(result.css).toContain('.custom-global { color: #fff; }');
    expect(result.css).toContain('--primary: #7c3aed');
  });

  it('generates responsive media queries for tablet and mobile overrides', () => {
    const responsiveCss = buildResponsiveDocumentCss(sampleInteractiveDoc);
    expect(responsiveCss).toContain('@media (max-width:1024px)');
    expect(responsiveCss).toContain('[data-wb-instance-id="root_home"]{padding:24px}');
    expect(responsiveCss).toContain('@media (max-width:767px)');
    expect(responsiveCss).toContain('[data-wb-instance-id="countdown_1"]{font-size:18px}');
  });
});

describe('Phase 8: Interactive Runtime Modules & Accessibility', () => {
  it('contains countdown timer ticker with dynamic format and expiration handling', () => {
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('updateCountdown');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('window.__eventosCountdownTimer');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('data-expired-message');
  });

  it('contains accessible keyboard navigation for tabs, accordion, and carousel', () => {
    // Tabs keyboard handler
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('data-wb-runtime="tabs"');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('ArrowLeft');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('ArrowRight');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('aria-selected');

    // Accordion handler
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('data-wb-runtime="accordion"');

    // Carousel keyboard and controls
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('data-wb-runtime="carousel"');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('data-carousel-prev');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('data-carousel-next');

    // Modal Escape key and focus return
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('data-wb-runtime="modal"');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain("event.key === 'Escape'");
  });

  it('contains reduced-motion compliance checks', () => {
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('prefers-reduced-motion: reduce');
    expect(PREVIEW_RUNTIME_CSS).toContain('@keyframes wb-fade-in');
    expect(PREVIEW_RUNTIME_CSS).toContain('@keyframes wb-marquee');
  });

  it('contains client-side form validation, honeypot protection, and AJAX submission', () => {
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('form.reportValidity()');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('data-honeypot');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('data-consent');
    expect(WEBSITE_RUNTIME_SCRIPT).toContain('component_instance_id');
  });
});
