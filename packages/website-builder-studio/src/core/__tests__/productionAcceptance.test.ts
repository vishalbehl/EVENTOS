import { describe, expect, it } from 'vitest';
import { EVENT_TEMPLATES } from '../../templates/eventTemplates';
import { useWebsiteDocumentStore } from '../websiteDocumentStore';
import { sanitizeSvg } from '../svgSanitizer';
import { canDeleteAsset } from '../assetManager';
import { exportWebsiteBundle, renderWebsiteDocument } from '../websiteDocumentRenderer';
import { Registry } from '../properties/PropertyRegistry';
import '../properties/schemas';

describe('Phase 12: End-to-End Production Acceptance & Regression Matrix', () => {
  it('executes the complete vertical lifecycle without errors or regressions', () => {
    // 1. Template Instantiation
    const techTemplate = EVENT_TEMPLATES.find(t => t.id === 'template_tech_summit');
    expect(techTemplate).toBeDefined();

    const initialDoc = techTemplate!.createDocument();
    useWebsiteDocumentStore.getState().replaceDocument(initialDoc);

    const store = useWebsiteDocumentStore.getState();
    expect(store.document?.site.siteName).toBe('Tech Horizon Summit 2026');
    expect(store.document?.pages.length).toBe(3); // Home + Speakers + Schedule

    // 2. Responsive Styling Override
    store.updateInstanceStyles('sec_hero', 'mobile', { padding: '32px 16px' });
    expect(useWebsiteDocumentStore.getState().document?.instances['sec_hero'].styles.mobile?.padding).toBe('32px 16px');
    expect(useWebsiteDocumentStore.getState().isDirty).toBe(true);

    // 3. Event Data Binding & Manual Override
    store.disconnectInstanceEvent('sec_hero');
    const heroAfterDisconnect = useWebsiteDocumentStore.getState().document?.instances['sec_hero'];
    const heroAttrs = heroAfterDisconnect?.props.attributes as Record<string, unknown> | undefined;
    expect(heroAttrs?.['data-source']).toBe('manual');

    // 4. Multi-Page Creation, Renaming & Anchor Link Cascade
    store.createPage('Workshops');
    const createdPage = useWebsiteDocumentStore.getState().document?.pages.find(p => p.name === 'Workshops');
    expect(createdPage).toBeDefined();
    expect(createdPage?.slug).toBe('workshops');

    // Rename page and verify slug update
    store.renamePage(createdPage!.id, 'Hands-on Labs');
    const renamedPage = useWebsiteDocumentStore.getState().document?.pages.find(p => p.id === createdPage!.id);
    expect(renamedPage?.name).toBe('Hands-on Labs');
    expect(renamedPage?.slug).toBe('hands-on-labs');

    // 5. SVG Sanitization & Asset Deletion Guard
    const rawMaliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="50" cy="50" r="40" onclick="alert(2)"/></svg>`;
    const cleanSvg = sanitizeSvg(rawMaliciousSvg);
    expect(cleanSvg).not.toContain('<script>');
    expect(cleanSvg).not.toContain('onclick');
    expect(cleanSvg).toContain('<circle cx="50" cy="50" r="40"');

    // Register clean asset
    store.upsertAsset({
      id: 'asset_clean_logo',
      type: 'svg',
      title: 'Clean Logo',
      source: 'upload',
      url: 'data:image/svg+xml;base64,...',
      savedAt: new Date().toISOString(),
    });

    // Reference asset in hero
    store.updateInstanceProps('sec_hero', {
      attributes: {
        'data-logo-asset-id': 'asset_clean_logo',
      },
    });

    // Guard against deleting referenced asset
    const guard = canDeleteAsset(useWebsiteDocumentStore.getState().document!, 'asset_clean_logo');
    expect(guard.allowed).toBe(false);
    expect(guard.referenceCount).toBeGreaterThanOrEqual(1);

    // 6. Revision Checkpoint & Rollback
    const baselineChecksum = useWebsiteDocumentStore.getState().document?.checksum;
    const checkpointId = store.createCheckpoint('Pre-destructive edits');
    expect(checkpointId).toBeTruthy();

    // Perform destructive edit
    store.deletePage(createdPage!.id);
    expect(useWebsiteDocumentStore.getState().document?.pages.find(p => p.id === createdPage!.id)).toBeUndefined();

    // Roll back
    const restored = store.restoreCheckpoint(checkpointId);
    expect(restored).toBe(true);
    expect(useWebsiteDocumentStore.getState().document?.pages.find(p => p.id === createdPage!.id)).toBeDefined();
    expect(useWebsiteDocumentStore.getState().document?.checksum).toBe(baselineChecksum);

    // 7. Preview and Export Rendering
    const finalDoc = useWebsiteDocumentStore.getState().document!;
    const preview = renderWebsiteDocument(finalDoc, finalDoc.pages[0].id, 'preview');
    expect(preview.diagnostics).toEqual([]);
    expect(preview.html).toContain('<script>(0,eval)');
    expect(preview.html).toContain('Tech Horizon Summit 2026');

    const exportBundle = exportWebsiteBundle(finalDoc);
    expect(exportBundle.diagnostics).toEqual([]);
    expect(exportBundle.pages.length).toBe(finalDoc.pages.length);
    expect(exportBundle.pages[0].route).toBe('/');
    expect(exportBundle.pages[0].artifactPath).toBe('index.html');
  });

  it('certifies that all 161 registered manifests comply with explicit property target rules', () => {
    const manifests = Registry.getAll();
    expect(manifests.length).toBeGreaterThanOrEqual(160);

    const violations: string[] = [];
    manifests.forEach(m => {
      m.schema.groups.forEach(g => {
        g.properties.forEach(p => {
          if (!p.target || !['content', 'attribute', 'style', 'class', 'component-state'].includes(p.target.kind)) {
            violations.push(`${m.id} -> ${g.groupId} -> ${p.id}`);
          }
        });
      });
    });

    expect(violations).toEqual([]);
  });
});
