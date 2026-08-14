import { useState, useEffect, useCallback } from 'react';
import type { Component } from 'grapesjs';
import type { PropertyDefinition } from './PropertyRegistry';
import { applyComponentSettings } from '../components/componentRenderers';
import { useWebsiteDocumentStore } from '../websiteDocumentStore';
import type { ResponsiveDevice } from '../../types';

/**
 * usePropertySync.ts
 *
 * Bidirectional sync between a PropertyDefinition and a GrapesJS Component.
 *
 * KEY INSIGHT: GrapesJS does NOT support CSS shorthand (e.g. "margin: 10px 20px").
 * It only reads/writes individual properties (margin-top, margin-right, etc.).
 *
 * The `Spacing` type is therefore handled at the editor level with 4 separate inputs.
 * All other style properties are individual CSS properties and work fine.
 */

type PropertyTarget = 'style' | 'attribute' | 'content' | 'class' | 'component';

// Full list of CSS properties that map to GrapesJS component.getStyle()
const CSS_STYLE_PROPS = new Set([
  // Box model — individual (GrapesJS does not support shorthand)
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  // Display & Flex
  'display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
  'align-self', 'align-content', 'gap', 'flex', 'flex-grow', 'flex-shrink',
  'row-gap', 'column-gap',
  // Grid
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  // Position
  'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'overflow', 'overflow-x', 'overflow-y',
  // Typography
  'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-transform',
  'text-decoration', 'white-space', 'word-break', 'color',
  // Background
  'background', 'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat', 'background-attachment',
  // Border — individual
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  // Effects
  'opacity', 'box-shadow', 'text-shadow', 'filter', 'backdrop-filter',
  'mix-blend-mode', 'cursor', 'pointer-events', 'user-select',
  // Transform
  'transform', 'transition', 'animation',
  // Misc
  'object-fit', 'object-position', 'visibility', 'clip-path',
  'aspect-ratio', 'box-sizing',
]);

function determinePropertyTarget(id: string): PropertyTarget {
  if (id === 'tagName') return 'component';
  if (CSS_STYLE_PROPS.has(id)) return 'style';
  if (id === 'textContent' || id === 'innerHTML') return 'content';
  if (id === 'className') return 'class';
  return 'attribute'; // data-*, id, src, alt, href, etc.
}

export function findTargetComponent(component: Component, selector?: string): Component {
  if (!selector || selector === ':self') return component;
  const found = component.find(selector)?.[0];
  if (found) return found;
  const tagName = String(component.get('tagName') || '').toLowerCase();
  const selectorList = selector.split(',').map(item => item.trim().toLowerCase());
  if (selectorList.includes(tagName)) return component;
  return component;
}

export function readPropertyTarget(property: PropertyDefinition): {
  target: PropertyTarget;
  key: string;
  selector?: string;
  classMap?: Record<string, string>;
} {
  if (!property.target) {
    const legacyTarget = determinePropertyTarget(property.id);
    return {
      target: legacyTarget,
      key:
        legacyTarget === 'style' ? property.id :
        legacyTarget === 'content' ? property.id :
        legacyTarget === 'class' ? property.id :
        property.id,
    };
  }

  switch (property.target.kind) {
    case 'style':
      return { target: 'style', key: property.target.css, selector: property.target.selector };
    case 'attribute':
      return { target: 'attribute', key: property.target.name, selector: property.target.selector };
    case 'content':
      return { target: 'content', key: property.id, selector: property.target.selector };
    case 'class':
      return { target: 'class', key: property.id, selector: property.target.selector, classMap: property.target.map };
    case 'component-state':
      return { target: 'attribute', key: `data-state-${property.target.key}` };
  }
}

function normalizeStyleValue(cssKey: string, value: string): string {
  if (cssKey === 'background-image' && value && !value.includes('gradient') && !value.startsWith('url(')) {
    return `url("${value.replace(/"/g, '\\"')}")`;
  }
  return value;
}

function denormalizeStyleValue(cssKey: string, value: string): string {
  if (cssKey === 'background-image') {
    const match = value.match(/^url\(["']?(.*?)["']?\)$/);
    return match?.[1] || value;
  }
  return value;
}

function commitComponentToDocument(component: Component, device: ResponsiveDevice = 'desktop') {
  const attributes = component.getAttributes() as Record<string, string>;
  const instanceId = attributes['data-wb-instance-id'];
  if (!instanceId) return;
  const childJson = (() => {
    try {
      return component.components().toJSON();
    } catch {
      return undefined;
    }
  })();
  const stringChildren = typeof childJson === 'string' ? childJson : undefined;
  const content = component.get('content');
  const textContent = component.getView()?.el?.textContent;
  useWebsiteDocumentStore.getState().updateInstance(instanceId, {
    props: {
      tagName: component.get('tagName'),
      attributes,
      content: typeof content === 'string' && content ? content : textContent || '',
      ...(stringChildren ? { html: stringChildren } : {}),
    },
    styles: {
      [device]: component.getStyle() as Record<string, string>,
    },
  });
}

export function commitGrapesComponentToDocument(component: Component, device: ResponsiveDevice = 'desktop') {
  commitComponentToDocument(component, device);
}

export function usePropertySync(component: Component, property: PropertyDefinition, device: ResponsiveDevice = 'desktop') {
  const [value, setValue] = useState<any>('');
  const [computedValue, setComputedValue] = useState<any>('');

  const readValue = useCallback((): any => {
    if (!component) return property.defaultValue ?? '';
    const mapping = readPropertyTarget(property);
    const target = mapping.target;
    const targetComponent = findTargetComponent(component, mapping.selector);

    switch (target) {
      case 'style': {
        if (device !== 'desktop') {
          const instanceId = (targetComponent.getAttributes() as Record<string, string>)['data-wb-instance-id'];
          const responsiveValue = instanceId
            ? useWebsiteDocumentStore.getState().document?.instances[instanceId]?.styles[device]?.[mapping.key]
            : undefined;
          return responsiveValue ? denormalizeStyleValue(mapping.key, responsiveValue) : '';
        }
        const styles = targetComponent.getStyle() as Record<string, string>;
        return styles[mapping.key] ? denormalizeStyleValue(mapping.key, styles[mapping.key]) : property.defaultValue ?? '';
      }
      case 'attribute': {
        const attributes = targetComponent.getAttributes() as Record<string, string>;
        return attributes[mapping.key] ?? property.defaultValue ?? '';
      }
      case 'content': {
        const el = targetComponent.getView()?.el;
        if (el) {
          // Only read text if there are no child components (so we don't break complex blocks)
          if (targetComponent.components().length === 0 || mapping.selector) {
            return el.innerText || el.textContent || '';
          }
        }
        return targetComponent.get('content') || property.defaultValue || '';
      }
      case 'class': {
        const cls = targetComponent.getClasses();
        if (mapping.classMap) {
          const classes = Array.isArray(cls) ? cls : [];
          const matched = Object.entries(mapping.classMap).find(([, className]) => classes.includes(className));
          return matched?.[0] || property.defaultValue || '';
        }
        return Array.isArray(cls) ? cls.join(' ') : (cls ?? '');
      }
      case 'component':
        if (mapping.key === 'tagName') return targetComponent.get('tagName') || property.defaultValue || '';
        return property.defaultValue ?? '';
    }

    return property.defaultValue ?? '';
  }, [component, property, device]);

  const readComputed = useCallback((): string => {
    const mapping = readPropertyTarget(property);
    const target = mapping.target;
    const cssKey = mapping.target === 'style' ? mapping.key : property.id;
    if (target === 'style') {
      const targetComponent = component ? findTargetComponent(component, mapping.selector) : null;
      const el = targetComponent?.getView()?.el;
      if (el) {
        try {
          return el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue(cssKey) || '';
        } catch {
          return '';
        }
      }
    }
    return '';
  }, [component, property]);

  // Sync on mount + component change
  useEffect(() => {
    if (!component) return;

    const refresh = () => {
      setValue(readValue());
      setComputedValue(readComputed());
    };

    refresh();

    component.on('change:style change:attributes change:content change:classes', refresh);
    return () => {
      component.off('change:style change:attributes change:content change:classes', refresh);
    };
  }, [component, property.id, readValue, readComputed]);

  // Write back to GrapesJS
  const updateValue = useCallback((newValue: any) => {
    setValue(newValue);
    if (!component) return;

    const mapping = readPropertyTarget(property);
    const target = mapping.target;
    const targetComponent = findTargetComponent(component, mapping.selector);
    const strVal = newValue !== null && newValue !== undefined ? String(newValue) : '';

    switch (target) {
      case 'style': {
        if (!strVal) {
          const styles = { ...(targetComponent.getStyle() as Record<string, string>) };
          delete styles[mapping.key];
          targetComponent.setStyle(styles);
        } else {
          targetComponent.addStyle({ [mapping.key]: normalizeStyleValue(mapping.key, strVal) });
        }
        break;
      }
      case 'attribute': {
        if (!strVal) {
          const attrs = { ...(targetComponent.getAttributes() as Record<string, string>) };
          delete attrs[mapping.key];
          targetComponent.setAttributes(attrs);
        } else {
          targetComponent.addAttributes({ [mapping.key]: strVal });
        }
        break;
      }
      case 'content': {
        // Only set text if the component has no child components
        if (targetComponent.components().length === 0 || mapping.selector) {
          const el = targetComponent.getView()?.el;
          if (el) {
            el.innerText = strVal;
            targetComponent.set('content', strVal);
          }
          if (targetComponent.components().length === 0 && typeof targetComponent.components === 'function') {
            targetComponent.components(strVal);
          }
        }
        break;
      }
      case 'class': {
        if (mapping.classMap) {
          const current = targetComponent.getClasses().filter((cls: string) => !Object.values(mapping.classMap || {}).includes(cls));
          const mapped = strVal ? mapping.classMap[strVal] : '';
          targetComponent.setClass(mapped ? [...current, mapped] : current);
        } else {
          targetComponent.setClass(strVal ? strVal.split(/\s+/).filter(Boolean) : []);
        }
        break;
      }
      case 'component': {
        if (mapping.key === 'tagName' && strVal) {
          targetComponent.set('tagName', strVal);
        }
        break;
      }
    }
    applyComponentSettings(targetComponent);
    if (targetComponent !== component) {
      applyComponentSettings(component);
    }
    commitComponentToDocument(targetComponent, device);
    if (targetComponent !== component) {
      commitComponentToDocument(component, device);
    }
    component.trigger('component:settings-applied', component);
    if (targetComponent !== component) {
      targetComponent.trigger('component:settings-applied', targetComponent);
    }
  }, [component, property, device]);

  return { value, computedValue, updateValue };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spacing Sync — reads/writes 4 individual CSS sides (margin-top/right/bottom/left)
// GrapesJS does NOT support shorthand margin/padding. Use this instead.
// ─────────────────────────────────────────────────────────────────────────────
export interface SpacingValues {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export function useSpacingSync(component: Component, property: 'margin' | 'padding', device: ResponsiveDevice = 'desktop') {
  const [values, setValues] = useState<SpacingValues>({ top: '', right: '', bottom: '', left: '' });
  const [computed, setComputed] = useState<SpacingValues>({ top: '', right: '', bottom: '', left: '' });

  const readSides = useCallback((): SpacingValues => {
    if (!component) return { top: '', right: '', bottom: '', left: '' };
    const instanceId = (component.getAttributes() as Record<string, string>)['data-wb-instance-id'];
    const styles = device === 'desktop'
      ? component.getStyle() as Record<string, string>
      : useWebsiteDocumentStore.getState().document?.instances[instanceId]?.styles[device] || {};
    return {
      top:    styles[`${property}-top`]    || '',
      right:  styles[`${property}-right`]  || '',
      bottom: styles[`${property}-bottom`] || '',
      left:   styles[`${property}-left`]   || '',
    };
  }, [component, property, device]);

  const readComputedSides = useCallback((): SpacingValues => {
    const el = component?.getView()?.el;
    if (!el) return { top: '', right: '', bottom: '', left: '' };
    try {
      const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
      if (!cs) return { top: '', right: '', bottom: '', left: '' };
      return {
        top:    cs.getPropertyValue(`${property}-top`)    || '',
        right:  cs.getPropertyValue(`${property}-right`)  || '',
        bottom: cs.getPropertyValue(`${property}-bottom`) || '',
        left:   cs.getPropertyValue(`${property}-left`)   || '',
      };
    } catch {
      return { top: '', right: '', bottom: '', left: '' };
    }
  }, [component, property]);

  useEffect(() => {
    if (!component) return;

    const refresh = () => {
      setValues(readSides());
      setComputed(readComputedSides());
    };

    refresh();
    component.on('change:style', refresh);
    return () => { component.off('change:style', refresh); };
  }, [component, property, readSides, readComputedSides]);

  const updateSide = useCallback((side: keyof SpacingValues, val: string) => {
    setValues(prev => ({ ...prev, [side]: val }));
    if (!component) return;

    const cssKey = `${property}-${side}`;
    if (!val) {
      const styles = { ...(component.getStyle() as Record<string, string>) };
      delete styles[cssKey];
      component.setStyle(styles);
    } else {
      const withUnit = /^-?\d+(\.\d+)?$/.test(val) ? `${val}px` : val;
      component.addStyle({ [cssKey]: withUnit });
    }
    applyComponentSettings(component);
    commitComponentToDocument(component, device);
    component.trigger('component:update', component);
    component.trigger('component:settings-applied', component);
  }, [component, property, device]);

  return { values, computed, updateSide };
}
