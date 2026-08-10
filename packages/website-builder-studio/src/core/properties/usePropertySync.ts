import { useState, useEffect, useCallback } from 'react';
import type { Component } from 'grapesjs';
import type { PropertyDefinition } from './PropertyRegistry';

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

type PropertyTarget = 'style' | 'attribute' | 'content' | 'class';

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
  if (CSS_STYLE_PROPS.has(id)) return 'style';
  if (id === 'textContent' || id === 'innerHTML') return 'content';
  if (id === 'className') return 'class';
  return 'attribute'; // data-*, id, src, alt, href, etc.
}

export function usePropertySync(component: Component, property: PropertyDefinition) {
  const [value, setValue] = useState<any>('');
  const [computedValue, setComputedValue] = useState<any>('');

  const readValue = useCallback((): any => {
    if (!component) return property.defaultValue ?? '';
    const target = determinePropertyTarget(property.id);

    switch (target) {
      case 'style': {
        const styles = component.getStyle() as Record<string, string>;
        return styles[property.id] ?? property.defaultValue ?? '';
      }
      case 'attribute': {
        const attributes = component.getAttributes() as Record<string, string>;
        return attributes[property.id] ?? property.defaultValue ?? '';
      }
      case 'content': {
        const el = component.getView()?.el;
        if (el) {
          // Only read text if there are no child components (so we don't break complex blocks)
          if (component.components().length === 0) {
            return el.innerText || el.textContent || '';
          }
        }
        return component.get('content') || '';
      }
      case 'class': {
        const cls = component.getClasses();
        return Array.isArray(cls) ? cls.join(' ') : (cls ?? '');
      }
    }
  }, [component, property.id, property.defaultValue]);

  const readComputed = useCallback((): string => {
    const target = determinePropertyTarget(property.id);
    if (target === 'style') {
      const el = component?.getView()?.el;
      if (el) {
        try {
          return window.getComputedStyle(el).getPropertyValue(property.id) || '';
        } catch {
          return '';
        }
      }
    }
    return '';
  }, [component, property.id]);

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

    const target = determinePropertyTarget(property.id);
    const strVal = newValue !== null && newValue !== undefined ? String(newValue) : '';

    switch (target) {
      case 'style': {
        if (!strVal) {
          const styles = { ...(component.getStyle() as Record<string, string>) };
          delete styles[property.id];
          component.setStyle(styles);
        } else {
          component.addStyle({ [property.id]: strVal });
        }
        break;
      }
      case 'attribute': {
        if (!strVal) {
          const attrs = { ...(component.getAttributes() as Record<string, string>) };
          delete attrs[property.id];
          component.setAttributes(attrs);
        } else {
          component.addAttributes({ [property.id]: strVal });
        }
        break;
      }
      case 'content': {
        // Only set text if the component has no child components
        if (component.components().length === 0) {
          const el = component.getView()?.el;
          if (el) {
            el.innerText = strVal;
            component.set('content', strVal);
          }
        }
        break;
      }
      case 'class': {
        component.setClass(strVal ? strVal.split(/\s+/).filter(Boolean) : []);
        break;
      }
    }
  }, [component, property.id]);

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

export function useSpacingSync(component: Component, property: 'margin' | 'padding') {
  const [values, setValues] = useState<SpacingValues>({ top: '', right: '', bottom: '', left: '' });
  const [computed, setComputed] = useState<SpacingValues>({ top: '', right: '', bottom: '', left: '' });

  const readSides = useCallback((): SpacingValues => {
    if (!component) return { top: '', right: '', bottom: '', left: '' };
    const styles = component.getStyle() as Record<string, string>;
    return {
      top:    styles[`${property}-top`]    || '',
      right:  styles[`${property}-right`]  || '',
      bottom: styles[`${property}-bottom`] || '',
      left:   styles[`${property}-left`]   || '',
    };
  }, [component, property]);

  const readComputedSides = useCallback((): SpacingValues => {
    const el = component?.getView()?.el;
    if (!el) return { top: '', right: '', bottom: '', left: '' };
    try {
      const cs = window.getComputedStyle(el);
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
      // Ensure value has a unit if it's a bare number
      const withUnit = /^\d+(\.\d+)?$/.test(val) ? `${val}px` : val;
      component.addStyle({ [cssKey]: withUnit });
    }
  }, [component, property]);

  return { values, computed, updateSide };
}
