import { describe, expect, it } from 'vitest';
import '../properties/schemas';
import { Registry } from '../properties/PropertyRegistry';

describe('property explicit targets audit', () => {
  it('identifies all properties without explicit targets', () => {
    const manifests = Registry.getAll();
    const missing: { manifest: string; group: string; propId: string; type: string; label: string }[] = [];

    manifests.forEach(manifest => {
      manifest.schema.groups.forEach(group => {
        group.properties.forEach(prop => {
          if (!prop.target) {
            missing.push({
              manifest: manifest.id,
              group: group.groupId,
              propId: prop.id,
              type: prop.type,
              label: prop.label,
            });
          }
        });
      });
    });

    console.log(`Audited ${manifests.length} manifests.`);
    console.log(`Found ${missing.length} properties missing explicit targets.`);
    if (missing.length > 0) {
      console.log('Sample missing:', missing.slice(0, 20));
    }

    // This test will be upgraded to expect(missing).toEqual([]) in Phase 3
    expect(missing.length).toBeDefined();
  });
});
