import { describe, expect, it } from 'vitest';
import '../properties/schemas';
import { BUILDER_COMPONENT_TYPES } from '../components/typeRegistry';
import { Registry } from '../properties/PropertyRegistry';
import { WEBSITE_COMPONENT_ASSETS } from '../../component-assets';

describe('website builder component contracts', () => {
  it('gives every registered canvas type a non-empty inspector manifest', () => {
    const missing = BUILDER_COMPONENT_TYPES.filter(type => !Registry.get(type));
    const empty = Registry.getAll().filter(manifest =>
      !manifest.schema.groups.length || manifest.schema.groups.every(group => !group.properties.length),
    );

    expect(missing).toEqual([]);
    expect(empty.map(manifest => manifest.id)).toEqual([]);
  });

  it('keeps component and property identifiers unique', () => {
    const manifests = Registry.getAll();
    expect(new Set(manifests.map(manifest => manifest.id)).size).toBe(manifests.length);
    manifests.forEach(manifest => {
      const ids = manifest.schema.groups.flatMap(group => group.properties.map(property => property.id));
      expect(new Set(ids).size, `duplicate property in ${manifest.id}`).toBe(ids.length);
    });
  });

  it('ships complete multi-page templates with resolvable internal links', () => {
    const templates = WEBSITE_COMPONENT_ASSETS.filter(asset => asset.kind === 'template');
    expect(templates.length).toBeGreaterThanOrEqual(3);

    templates.forEach(template => {
      const pages = template.template?.pages || [];
      const routes = new Set(pages.map(page => page.isHomePage ? '/' : `/${page.slug}`));
      expect(pages.length, `${template.id} page count`).toBeGreaterThanOrEqual(3);
      expect(pages.filter(page => page.isHomePage)).toHaveLength(1);
      expect(routes.size).toBe(pages.length);

      pages.forEach(page => {
        const hrefs = [...page.html.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)].map(match => match[1]);
        const unresolved = hrefs.filter(href => href.startsWith('/') && !routes.has(href) && !['/registration', '/speaker-portal'].includes(href));
        expect(unresolved, `${template.id}:${page.slug || 'home'} links`).toEqual([]);
      });
    });
  });
});
