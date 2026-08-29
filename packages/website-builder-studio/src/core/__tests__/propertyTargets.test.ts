import { describe, expect, it } from 'vitest';
import '../properties/schemas';
import { Registry } from '../properties/PropertyRegistry';

describe('property explicit targets audit', () => {
  it('strictly requires all properties across all manifests to have an explicit target', () => {
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

    expect(manifests.length).toBeGreaterThanOrEqual(160);
    expect(missing).toEqual([]);
  });
});
