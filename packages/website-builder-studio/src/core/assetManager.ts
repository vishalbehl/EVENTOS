import type { WebsiteDocument } from '../types';

export interface AssetReferenceMatch {
  pageId: string;
  pageName: string;
  instanceId: string;
  componentType: string;
  property: string;
  value: string;
}

export interface AssetDeletionCheckResult {
  allowed: boolean;
  referenceCount: number;
  references: AssetReferenceMatch[];
}

/**
 * Searches the entire WebsiteDocument across all pages for usages of a given asset ID or asset URL.
 */
export function findAssetReferencesInDocument(
  document: WebsiteDocument,
  assetIdOrUrl: string,
): AssetReferenceMatch[] {
  if (!document || !assetIdOrUrl) return [];

  const target = assetIdOrUrl.trim();
  const matches: AssetReferenceMatch[] = [];

  // Map root instances to pages
  const pageMap = new Map<string, { id: string; name: string }>();
  document.pages.forEach(page => {
    pageMap.set(page.id, { id: page.id, name: page.name });
  });

  // Helper to find which page contains an instance
  const findPageForInstance = (instanceId: string): { id: string; name: string } => {
    for (const page of document.pages) {
      if (isDescendantOfRoot(document, instanceId, page.rootInstanceId)) {
        return { id: page.id, name: page.name };
      }
    }
    return { id: document.pages[0]?.id || 'unknown', name: document.pages[0]?.name || 'Unknown Page' };
  };

  Object.values(document.instances).forEach(instance => {
    const page = findPageForInstance(instance.id);

    // 1. Check attributes
    const attrs = instance.props.attributes;
    if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
      Object.entries(attrs as Record<string, unknown>).forEach(([attrName, attrValue]) => {
        if (typeof attrValue === 'string' && (attrValue.includes(target) || attrValue === target)) {
          matches.push({
            pageId: page.id,
            pageName: page.name,
            instanceId: instance.id,
            componentType: instance.componentType,
            property: `attributes.${attrName}`,
            value: attrValue,
          });
        }
      });
    }

    // 2. Check props (src, url, banner, logo, photo, etc.)
    Object.entries(instance.props).forEach(([propName, propValue]) => {
      if (propName === 'attributes' || propName === 'link') return;
      if (typeof propValue === 'string' && (propValue.includes(target) || propValue === target)) {
        matches.push({
          pageId: page.id,
          pageName: page.name,
          instanceId: instance.id,
          componentType: instance.componentType,
          property: `props.${propName}`,
          value: propValue,
        });
      }
    });

    // 3. Check link URL
    const link = instance.props.link;
    if (link && typeof link === 'object' && !Array.isArray(link)) {
      const linkObj = link as Record<string, unknown>;
      if (typeof linkObj.url === 'string' && (linkObj.url.includes(target) || linkObj.url === target)) {
        matches.push({
          pageId: page.id,
          pageName: page.name,
          instanceId: instance.id,
          componentType: instance.componentType,
          property: 'props.link.url',
          value: linkObj.url,
        });
      }
    }

    // 4. Check styles (background-image, background, etc.)
    Object.entries(instance.styles || {}).forEach(([device, styleMap]) => {
      if (!styleMap) return;
      Object.entries(styleMap).forEach(([styleKey, styleValue]) => {
        if (typeof styleValue === 'string' && (styleValue.includes(target) || styleValue === target)) {
          matches.push({
            pageId: page.id,
            pageName: page.name,
            instanceId: instance.id,
            componentType: instance.componentType,
            property: `styles.${device}.${styleKey}`,
            value: styleValue,
          });
        }
      });
    });
  });

  return matches;
}

function isDescendantOfRoot(document: WebsiteDocument, targetId: string, rootId: string): boolean {
  if (targetId === rootId) return true;
  const root = document.instances[rootId];
  if (!root || !root.children) return false;
  if (root.children.includes(targetId)) return true;
  return root.children.some(childId => isDescendantOfRoot(document, targetId, childId));
}

/**
 * Checks whether an asset can be safely deleted without breaking references on any page.
 */
export function canDeleteAsset(document: WebsiteDocument, assetIdOrUrl: string): AssetDeletionCheckResult {
  const references = findAssetReferencesInDocument(document, assetIdOrUrl);
  return {
    allowed: references.length === 0,
    referenceCount: references.length,
    references,
  };
}
