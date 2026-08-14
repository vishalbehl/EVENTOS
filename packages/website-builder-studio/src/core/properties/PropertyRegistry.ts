/**
 * PropertyRegistry.ts
 * 
 * Defines the core architecture for the decoupled React Property Studio.
 * This file contains the standard groups and types for the Inspector UI.
 */

export type PropertyGroupId = 
  | 'CONTENT'
  | 'STYLE'
  | 'APPEARANCE'
  | 'LAYOUT'
  | 'SPACING'
  | 'BACKGROUND'
  | 'BORDER'
  | 'TYPOGRAPHY'
  | 'EFFECTS'
  | 'MEDIA'
  | 'OVERLAY'
  | 'HOVER'
  | 'ANIMATION'
  | 'RESPONSIVE'
  | 'VISIBILITY'
  | 'ADVANCED';

export interface PropertyGroupDef {
  id: PropertyGroupId;
  label: string;
  icon?: string;
  defaultExpanded?: boolean;
}

export const PROPERTY_GROUPS: Record<PropertyGroupId, PropertyGroupDef> = {
  CONTENT:    { id: 'CONTENT',    label: 'Content',     icon: 'align-left',    defaultExpanded: true },
  STYLE:      { id: 'STYLE',      label: 'Style',       icon: 'palette',       defaultExpanded: true },
  APPEARANCE: { id: 'APPEARANCE', label: 'Appearance',  icon: 'image' },
  LAYOUT:     { id: 'LAYOUT',     label: 'Layout',      icon: 'layout' },
  SPACING:    { id: 'SPACING',    label: 'Spacing',     icon: 'maximize' },
  BACKGROUND: { id: 'BACKGROUND', label: 'Background',  icon: 'image' },
  BORDER:     { id: 'BORDER',     label: 'Border',      icon: 'square' },
  TYPOGRAPHY: { id: 'TYPOGRAPHY', label: 'Typography',  icon: 'type' },
  EFFECTS:    { id: 'EFFECTS',    label: 'Effects',     icon: 'sparkles' },
  MEDIA:      { id: 'MEDIA',      label: 'Media',       icon: 'video' },
  OVERLAY:    { id: 'OVERLAY',    label: 'Overlay',     icon: 'layers' },
  HOVER:      { id: 'HOVER',      label: 'Hover',       icon: 'mouse-pointer' },
  ANIMATION:  { id: 'ANIMATION',  label: 'Animation',   icon: 'play' },
  RESPONSIVE: { id: 'RESPONSIVE', label: 'Responsive',  icon: 'smartphone' },
  VISIBILITY: { id: 'VISIBILITY', label: 'Visibility',  icon: 'eye' },
  ADVANCED:   { id: 'ADVANCED',   label: 'Advanced',    icon: 'settings' },
};

// Base interface for all properties
export interface BaseProperty {
  id: string; // The property key, e.g., 'font-size', 'data-aos', 'text-content'
  label: string;
  type: string; // E.g., 'Text', 'Color', 'Select', 'Spacing'
  target?: PropertyTarget;
  defaultValue?: any;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  dependsOn?: string; // Property ID it depends on
  hiddenWhen?: (values: Record<string, any>) => boolean;
  disabledWhen?: (values: Record<string, any>) => boolean;
  validator?: (value: any) => string | null; // Returns error message or null
}

export type PropertyTarget =
  | { kind: 'content'; selector?: string }
  | { kind: 'attribute'; name: string; selector?: string }
  | { kind: 'style'; css: string; selector?: string; responsive?: boolean }
  | { kind: 'class'; map?: Record<string, string>; selector?: string }
  | { kind: 'component-state'; key: string };

// Example specific property definitions (will expand these in Phase 3)
export interface SelectProperty extends BaseProperty {
  type: 'Select';
  options: { value: string; label: string }[];
}

export interface TextProperty extends BaseProperty {
  type: 'Text';
  placeholder?: string;
}

export interface TextareaProperty extends BaseProperty {
  type: 'Textarea';
  placeholder?: string;
  rows?: number;
}

export interface ColorProperty extends BaseProperty {
  type: 'Color';
}

export interface SpacingProperty extends BaseProperty {
  type: 'Spacing';
  // If property id is 'margin', it controls margin-top, margin-right, etc.
}

export interface ToggleProperty extends BaseProperty {
  type: 'Toggle';
}

export interface EventDataSourceProperty extends BaseProperty {
  type: 'EventDataSource';
  accepts: ('speakers' | 'sponsors' | 'agenda' | 'tickets')[];
}

export interface AssetProperty extends BaseProperty {
  type: 'Asset';
  accepts?: ('image' | 'video' | 'document')[];
}

export type PropertyDefinition =
  | BaseProperty
  | SelectProperty
  | TextProperty
  | TextareaProperty
  | ColorProperty
  | SpacingProperty
  | ToggleProperty
  | EventDataSourceProperty
  | AssetProperty;

// A Component Schema defines which properties a GrapesJS component supports
export interface ComponentPropertySchema {
  groups: {
    groupId: string; // accepts PropertyGroupId or custom string
    properties: PropertyDefinition[];
  }[];
}

export interface ComponentManifest {
  id: string; // Matches GrapesJS component type
  title: string;
  icon?: string;
  category?: string;
  description?: string;
  tags?: string[];
  keywords?: string[];
  variants?: string[];
  thumbnail?: string;
  supportsData?: boolean;
  supportsTheme?: boolean;
  supportsAnimation?: boolean;
  supportsResponsive?: boolean;
  defaults?: Record<string, any>;
  renderer?: string;
  dataBinding?: {
    fields: string[];
    fallback?: 'mock' | 'empty' | 'manual';
  };
  schema: ComponentPropertySchema;
}

// Registry to hold all component manifests
class PropertySchemaRegistry {
  private manifests: Map<string, ComponentManifest> = new Map();

  register(manifest: ComponentManifest) {
    this.manifests.set(manifest.id, manifest);
  }

  get(componentType: string): ComponentManifest | undefined {
    return this.manifests.get(componentType);
  }

  getAll(): ComponentManifest[] {
    return Array.from(this.manifests.values());
  }

  // Fallback manifest if a component hasn't been explicitly defined yet
  getFallback(componentType: string, tagName: string): ComponentManifest {
    const normalizedType = String(componentType || '').toLowerCase();
    const normalizedTag = String(tagName || '').toLowerCase();

    if (
      ['text', 'textnode', 'label'].includes(normalizedType) ||
      ['p', 'span', 'strong', 'em', 'small', 'label', 'li'].includes(normalizedTag)
    ) {
      return {
        id: componentType,
        title: normalizedTag ? normalizedTag.toUpperCase() : 'Text',
        category: 'Typography',
        schema: {
          groups: [
            {
              groupId: 'CONTENT',
              properties: [
                { id: 'data-content', type: 'Textarea', label: 'Text Content', target: { kind: 'content', selector: ':self' } },
              ],
            },
            {
              groupId: 'TYPOGRAPHY',
              properties: [
                { id: 'font-family', type: 'Text', label: 'Font Family', target: { kind: 'style', css: 'font-family' } },
                { id: 'font-size', type: 'Text', label: 'Font Size', target: { kind: 'style', css: 'font-size' } },
                { id: 'font-weight', type: 'Text', label: 'Font Weight', target: { kind: 'style', css: 'font-weight' } },
                { id: 'line-height', type: 'Text', label: 'Line Height', target: { kind: 'style', css: 'line-height' } },
                { id: 'letter-spacing', type: 'Text', label: 'Letter Spacing', target: { kind: 'style', css: 'letter-spacing' } },
                { id: 'text-align', type: 'Select', label: 'Text Align', target: { kind: 'style', css: 'text-align' }, options: [
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                  { value: 'justify', label: 'Justify' },
                ] },
                { id: 'color', type: 'Color', label: 'Text Color', target: { kind: 'style', css: 'color' } },
              ],
            },
            {
              groupId: 'SPACING',
              properties: [
                { id: 'margin', type: 'Spacing', label: 'Margin' },
                { id: 'padding', type: 'Spacing', label: 'Padding' },
              ],
            },
          ],
        },
      };
    }

    if (normalizedType === 'image' || normalizedTag === 'img') {
      return {
        id: componentType,
        title: 'Image',
        category: 'Media',
        schema: {
          groups: [
            {
              groupId: 'CONTENT',
              properties: [
                { id: 'src', type: 'Asset', label: 'Image', target: { kind: 'attribute', name: 'src', selector: ':self' } },
                { id: 'alt', type: 'Text', label: 'Alt Text', target: { kind: 'attribute', name: 'alt', selector: ':self' } },
              ],
            },
            {
              groupId: 'MEDIA',
              properties: [
                { id: 'object-fit', type: 'Select', label: 'Object Fit', target: { kind: 'style', css: 'object-fit' }, options: [
                  { value: 'cover', label: 'Cover' },
                  { value: 'contain', label: 'Contain' },
                  { value: 'fill', label: 'Fill' },
                  { value: 'none', label: 'None' },
                ] },
                { id: 'object-position', type: 'Text', label: 'Object Position', target: { kind: 'style', css: 'object-position' } },
                { id: 'aspect-ratio', type: 'Text', label: 'Aspect Ratio', target: { kind: 'style', css: 'aspect-ratio' } },
              ],
            },
          ],
        },
      };
    }

    if (normalizedType === 'link' || normalizedTag === 'a') {
      return {
        id: componentType,
        title: 'Link',
        category: 'Buttons',
        schema: {
          groups: [
            {
              groupId: 'CONTENT',
              properties: [
                { id: 'data-label', type: 'Text', label: 'Label', target: { kind: 'content', selector: ':self' } },
                { id: 'href', type: 'Link', label: 'Link', target: { kind: 'attribute', name: 'href' } },
                { id: 'target', type: 'Select', label: 'Open In', target: { kind: 'attribute', name: 'target' }, options: [
                  { value: '_self', label: 'Same Tab' },
                  { value: '_blank', label: 'New Tab' },
                ] },
              ],
            },
            {
              groupId: 'TYPOGRAPHY',
              properties: [
                { id: 'color', type: 'Color', label: 'Text Color', target: { kind: 'style', css: 'color' } },
                { id: 'font-size', type: 'Text', label: 'Font Size', target: { kind: 'style', css: 'font-size' } },
                { id: 'font-weight', type: 'Text', label: 'Font Weight', target: { kind: 'style', css: 'font-weight' } },
                { id: 'text-decoration', type: 'Select', label: 'Decoration', target: { kind: 'style', css: 'text-decoration' }, options: [
                  { value: 'none', label: 'None' },
                  { value: 'underline', label: 'Underline' },
                ] },
              ],
            },
          ],
        },
      };
    }

    if (normalizedType === 'button' || normalizedTag === 'button') {
      return {
        id: componentType,
        title: 'Button',
        category: 'Buttons',
        schema: {
          groups: [
            {
              groupId: 'CONTENT',
              properties: [
                { id: 'data-label', type: 'Text', label: 'Label', target: { kind: 'content', selector: ':self' } },
                { id: 'href', type: 'Link', label: 'Link', target: { kind: 'attribute', name: 'href' } },
              ],
            },
            {
              groupId: 'STYLE',
              properties: [
                { id: 'background', type: 'Color', label: 'Background', target: { kind: 'style', css: 'background' } },
                { id: 'color', type: 'Color', label: 'Text Color', target: { kind: 'style', css: 'color' } },
                { id: 'border-radius', type: 'Text', label: 'Radius', target: { kind: 'style', css: 'border-radius' } },
              ],
            },
          ],
        },
      };
    }

    return {
      id: componentType,
      title: tagName || componentType,
      category: 'Basic',
      schema: {
        groups: [
          {
            groupId: 'CONTENT',
            properties: [
              { id: 'data-content', type: 'Textarea', label: 'Content', target: { kind: 'content', selector: ':self' } },
            ],
          },
          {
            groupId: 'STYLE',
            properties: [
              { id: 'background', type: 'Color', label: 'Background', target: { kind: 'style', css: 'background' } },
              { id: 'color', type: 'Color', label: 'Text Color', target: { kind: 'style', css: 'color' } },
              { id: 'border-radius', type: 'Text', label: 'Radius', target: { kind: 'style', css: 'border-radius' } },
            ],
          },
          {
            groupId: 'SPACING',
            properties: [
              { id: 'margin', type: 'Spacing', label: 'Margin' },
              { id: 'padding', type: 'Spacing', label: 'Padding' },
            ],
          },
          {
            groupId: 'ADVANCED',
            properties: [
              { id: 'id', type: 'Text', label: 'HTML ID' },
              { id: 'title', type: 'Text', label: 'Title Attribute' }
            ]
          }
        ]
      }
    };
  }
}

export const Registry = new PropertySchemaRegistry();
