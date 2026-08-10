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

  // Fallback manifest if a component hasn't been explicitly defined yet
  getFallback(componentType: string, tagName: string): ComponentManifest {
    return {
      id: componentType,
      title: tagName || componentType,
      category: 'Basic',
      schema: {
        groups: [
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
