import { describe, expect, it } from 'vitest';
import { EVENT_TEMPLATES } from '../../templates/eventTemplates';
import { exportWebsiteBundle, renderWebsiteDocument } from '../websiteDocumentRenderer';
import { Registry } from '../properties/PropertyRegistry';
import '../properties/schemas'; // Ensure schemas are registered
import { PREVIEW_RUNTIME_CSS } from '../runtime';

describe('Phase 11: Premium Event Templates Catalog', () => {
  it('contains 6 curated templates across distinct event categories', () => {
    expect(EVENT_TEMPLATES).toHaveLength(6);
    const categories = EVENT_TEMPLATES.map(t => t.category);
    expect(categories).toEqual(['tech', 'medical', 'hackathon', 'academic', 'expo', 'gala']);
  });

  it.each(EVENT_TEMPLATES)('creates a valid, renderable document for template: $name', (template) => {
    const doc = template.createDocument();

    // Structural validations
    expect(doc.schemaVersion).toBe(1);
    expect(doc.checksum).toBeTruthy();
    expect(doc.pages.length).toBeGreaterThanOrEqual(1);

    const homePages = doc.pages.filter(p => p.isHomePage);
    expect(homePages).toHaveLength(1);

    // Verify all instances referenced in pages exist in instances map
    doc.pages.forEach(page => {
      expect(doc.instances[page.rootInstanceId]).toBeDefined();
    });

    // Render Preview
    const preview = renderWebsiteDocument(doc, homePages[0].id, 'preview');
    expect(preview.diagnostics).toEqual([]);
    expect(preview.html).toContain('<script>(0,eval)');
    expect(preview.css).toContain(doc.tokens.theme?.primary);

    // Export Bundle
    const bundle = exportWebsiteBundle(doc);
    expect(bundle.diagnostics).toEqual([]);
    expect(bundle.pages.length).toBe(doc.pages.length);
    expect(bundle.pages[0].route).toBe('/');
    expect(bundle.pages[0].artifactPath).toBe('index.html');
  });
});

describe('Phase 11: Aceternity Component Manifests & Runtime Parity', () => {
  const aceternityComponentTypes = [
    'aceternity-aurora-background',
    'aceternity-spotlight',
    'aceternity-background-gradient',
    'aceternity-hover-border-gradient',
    'aceternity-moving-border',
    'aceternity-bento-grid',
    'aceternity-text-generate-effect',
    'aceternity-typewriter-effect',
    'aceternity-infinite-moving-cards',
    'aceternity-grid',
    'aceternity-sparkles',
    'aceternity-meteors',
  ];

  it.each(aceternityComponentTypes)('registers manifest for %s with explicit property targets', (type) => {
    const manifest = Registry.get(type);
    expect(manifest).toBeDefined();
    expect(manifest?.id).toBe(type);

    // All schema properties in groups must have explicit targets
    const allProps = manifest?.schema.groups.flatMap(g => g.properties) || [];
    expect(allProps.length).toBeGreaterThan(0);
    allProps.forEach(prop => {
      expect(prop.target).toBeDefined();
      if (prop.target) {
        expect(['content', 'attribute', 'style', 'class', 'component-state']).toContain(prop.target.kind);
      }
    });
  });

  it('contains animation styling and reduced motion checks for visual effects', () => {
    expect(PREVIEW_RUNTIME_CSS).toContain('wb-ac-');
    expect(PREVIEW_RUNTIME_CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
