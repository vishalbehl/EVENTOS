import React, { useEffect, useState, useMemo, useCallback } from 'react';
import type { Editor, Component } from 'grapesjs';
import { ChevronRight, ChevronDown, Settings2, Search, X, CornerDownRight, PanelRightClose } from 'lucide-react';
import { Registry, PROPERTY_GROUPS } from '../../core/properties/PropertyRegistry';
import type { ComponentManifest, PropertyGroupDef, PropertyDefinition } from '../../core/properties/PropertyRegistry';
import { PropertyEditorFactory } from './editors/PropertyEditorFactory';
import {
  AdvancedGroup,
  AnimationGroup,
  BackgroundGroup,
  BorderGroup,
  EffectsGroup,
  LayoutGroup,
  ResponsiveGroup,
  SpacingGroup,
  TypographyGroup,
} from '../../core/properties/groups';
import type { ImportStatus } from '../../hooks/useEventImport';
import type { PageConfig, ResponsiveDevice } from '../../types';
import { commitGrapesComponentToDocument, findTargetComponent, readPropertyTarget } from '../../core/properties/usePropertySync';
import { applyComponentSettings } from '../../core/components/componentRenderers';

interface PropertyStudioProps {
  editor: Editor | null;
  pages?: PageConfig[];
  eventStatus?: ImportStatus | 'mock';
  onFetchEventData?: () => void | Promise<void>;
  onCollapseInspector?: () => void;
  readOnly?: boolean;
  device?: ResponsiveDevice;
}

function safeGetSelected(editor: Editor): Component | null {
  try {
    return editor.getSelected() || null;
  } catch {
    return null;
  }
}

const SHARED_GROUPS: { groupId: string; properties: PropertyDefinition[] }[] = [
  { groupId: 'LAYOUT', properties: LayoutGroup },
  { groupId: 'TYPOGRAPHY', properties: TypographyGroup },
  { groupId: 'SPACING', properties: SpacingGroup },
  { groupId: 'BACKGROUND', properties: BackgroundGroup },
  { groupId: 'BORDER', properties: BorderGroup },
  { groupId: 'EFFECTS', properties: EffectsGroup },
  { groupId: 'ANIMATION', properties: AnimationGroup },
  { groupId: 'RESPONSIVE', properties: ResponsiveGroup },
  { groupId: 'ADVANCED', properties: AdvancedGroup },
];

type InspectorPane = 'content' | 'style';

const GROUP_PANE: Record<string, InspectorPane> = {
  CONTENT: 'content',
  MEDIA: 'style',
  OVERLAY: 'style',
  STYLE: 'style',
  APPEARANCE: 'style',
  LAYOUT: 'style',
  TYPOGRAPHY: 'style',
  SPACING: 'style',
  BACKGROUND: 'style',
  BORDER: 'style',
  EFFECTS: 'style',
  HOVER: 'style',
  ANIMATION: 'style',
  RESPONSIVE: 'style',
  VISIBILITY: 'style',
  ADVANCED: 'style',
};

const INSPECTOR_TABS: { id: InspectorPane; label: string }[] = [
  { id: 'content', label: 'Content' },
  { id: 'style', label: 'Styling' },
];

function allowedSharedGroups(manifest: ComponentManifest): Set<string> {
  const id = manifest.id;
  const category = manifest.category || '';

  if (category === 'Typography' || ['heading', 'subheading', 'paragraph', 'lead-text', 'blockquote', 'highlight', 'counter', 'marquee'].includes(id)) {
    return new Set(['TYPOGRAPHY', 'SPACING', 'EFFECTS', 'ANIMATION', 'RESPONSIVE', 'ADVANCED']);
  }

  if (category === 'Media' || ['image', 'gallery', 'video', 'image-text', 'logo-marquee', 'icon-block'].includes(id)) {
    return new Set(['LAYOUT', 'SPACING', 'BORDER', 'EFFECTS', 'ANIMATION', 'RESPONSIVE', 'ADVANCED']);
  }

  if (category === 'Forms' || category === 'Buttons' || ['button', 'button-group', 'contact-form', 'newsletter', 'sponsor-inquiry'].includes(id)) {
    return new Set(['LAYOUT', 'SPACING', 'BACKGROUND', 'BORDER', 'EFFECTS', 'ANIMATION', 'RESPONSIVE', 'ADVANCED']);
  }

  if (category === 'Navigation' || category === 'Headers' || ['header', 'navigation', 'footer', 'breadcrumb', 'progress-bar'].includes(id)) {
    return new Set(['LAYOUT', 'TYPOGRAPHY', 'SPACING', 'BACKGROUND', 'BORDER', 'EFFECTS', 'ANIMATION', 'RESPONSIVE', 'ADVANCED']);
  }

  if (category === 'Event' || manifest.supportsData) {
    return new Set(['LAYOUT', 'TYPOGRAPHY', 'SPACING', 'BACKGROUND', 'BORDER', 'EFFECTS', 'ANIMATION', 'RESPONSIVE', 'ADVANCED']);
  }

  if (['map', 'qr-code', 'social-icons', 'badge', 'alert', 'countdown'].includes(id)) {
    return new Set(['LAYOUT', 'TYPOGRAPHY', 'SPACING', 'BACKGROUND', 'BORDER', 'EFFECTS', 'ANIMATION', 'RESPONSIVE', 'ADVANCED']);
  }

  return new Set(['LAYOUT', 'SPACING', 'BACKGROUND', 'BORDER', 'EFFECTS', 'ANIMATION', 'RESPONSIVE', 'ADVANCED']);
}

function readValues(component: Component, properties: PropertyDefinition[]) {
  return properties.reduce<Record<string, any>>((acc, property) => {
    const mapping = readPropertyTarget(property);
    const targetComponent = findTargetComponent(component, mapping.selector);
    if (mapping.target === 'style') {
      const styles = targetComponent.getStyle() as Record<string, string>;
      acc[property.id] = styles[mapping.key] ?? property.defaultValue ?? '';
      return acc;
    }
    if (mapping.target === 'attribute') {
      const attrs = targetComponent.getAttributes() as Record<string, string>;
      acc[property.id] = attrs[mapping.key] ?? property.defaultValue ?? '';
      return acc;
    }
    if (mapping.target === 'content') {
      const el = targetComponent.getView()?.el;
      acc[property.id] = el?.textContent || targetComponent.get('content') || property.defaultValue || '';
      return acc;
    }
    acc[property.id] = property.defaultValue ?? '';
    return acc;
  }, {});
}

function mergeManifestGroups(manifest: ComponentManifest) {
  const groups = manifest.schema.groups.map(group => ({
    ...group,
    properties: [...group.properties],
  }));
  const allowedGroups = allowedSharedGroups(manifest);

  SHARED_GROUPS.forEach(shared => {
    if (!allowedGroups.has(shared.groupId)) return;
    const existing = groups.find(group => group.groupId === shared.groupId);
    if (!existing) {
      groups.push({ groupId: shared.groupId, properties: [...shared.properties] });
      return;
    }

    const existingIds = new Set(existing.properties.map(prop => prop.id));
    shared.properties.forEach(prop => {
      if (!existingIds.has(prop.id)) existing.properties.push(prop);
    });
  });

  return groups;
}

// ---------------------------------------------------------------------------
// Accordion Group — a single collapsible section of property editors
// ---------------------------------------------------------------------------
const AccordionGroup: React.FC<{
  groupDef: PropertyGroupDef;
  properties: PropertyDefinition[];
  editor: Editor;
  component: Component;
  searchQuery: string;
  pages?: PageConfig[];
  device?: ResponsiveDevice;
}> = ({ groupDef, properties, editor, component, searchQuery, pages, device }) => {
  const [isExpanded, setIsExpanded] = useState(groupDef.defaultExpanded ?? false);

  // Filter properties by search query
  const visibleProperties = useMemo(() => {
    const values = readValues(component, properties);
    const unhidden = properties.filter(p => !p.hiddenWhen?.(values));
    if (!searchQuery) return unhidden;
    const q = searchQuery.toLowerCase();
    return unhidden.filter(p =>
      p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [component, properties, searchQuery]);

  // Auto-expand group when there's a search match
  useEffect(() => {
    if (searchQuery && visibleProperties.length > 0) {
      setIsExpanded(true);
    }
  }, [searchQuery, visibleProperties.length]);

  // Don't render group at all if no props pass the filter
  if (visibleProperties.length === 0) return null;

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between py-2.5 px-4 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-white/[0.02] transition-colors"
      >
        <span className="uppercase tracking-widest">{groupDef.label}</span>
        <span className="flex items-center gap-2">
          {!isExpanded && visibleProperties.length > 0 && (
            <span className="text-[9px] font-mono text-muted-foreground/40">{visibleProperties.length}</span>
          )}
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 opacity-60" />
          ) : (
            <ChevronRight className="w-3 h-3 opacity-60" />
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 pt-1 space-y-0">
          {visibleProperties.map(prop => (
            <PropertyEditorFactory key={prop.id} property={prop} component={component} pages={pages} device={device} />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Property Studio
// ---------------------------------------------------------------------------
export const PropertyStudio: React.FC<PropertyStudioProps> = ({ editor, pages = [], eventStatus = 'idle', onFetchEventData, onCollapseInspector, readOnly = false, device = 'desktop' }) => {
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [, setUpdateTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activePane, setActivePane] = useState<InspectorPane>('content');

  useEffect(() => {
    if (!editor) return;

    const handleSelected = (model: Component) => {
      setSelectedComponent(model);
      setSearchQuery('');
      setShowSearch(false);
    };
    const handleDeselected = () => {
      setSelectedComponent(null);
      setSearchQuery('');
    };
    const handleUpdate = () => setUpdateTrigger(prev => prev + 1);

    editor.on('component:selected', handleSelected);
    editor.on('component:deselected', handleDeselected);
    editor.on('component:update', handleUpdate);

    const selected = safeGetSelected(editor);
    if (selected) setSelectedComponent(selected);

    return () => {
      editor.off('component:selected', handleSelected);
      editor.off('component:deselected', handleDeselected);
      editor.off('component:update', handleUpdate);
    };
  }, [editor]);

  const manifest = useMemo<ComponentManifest | null>(() => {
    if (!selectedComponent) return null;
    const type = selectedComponent.get('type') || selectedComponent.get('tagName') || 'default';
    return Registry.get(type) || Registry.getFallback(type, selectedComponent.get('tagName') || '');
  }, [selectedComponent]);

  const handleSearchToggle = useCallback(() => {
    setShowSearch(prev => {
      if (prev) setSearchQuery('');
      return !prev;
    });
  }, []);

  // ----- Empty state -----
  if (!selectedComponent || !manifest || !editor) {
    return (
      <div className="wb-settings-hidden-state">
        <Settings2 className="w-4 h-4" />
        <span>Settings hidden</span>
      </div>
    );
  }

  const componentName = manifest.title || selectedComponent.getName() || selectedComponent.get('type') || '';
  const unifiedGroups = mergeManifestGroups(manifest);
  const paneGroups = unifiedGroups.filter(group => (GROUP_PANE[group.groupId] || 'advanced') === activePane);
  const paneProperties = paneGroups.reduce((acc, g) => acc + g.properties.length, 0);
  const selectedAttributes = selectedComponent.getAttributes() as Record<string, string>;
  const updateSelectedAttribute = (name: string, value: string) => {
    if (!value) {
      const attrs = { ...(selectedComponent.getAttributes() as Record<string, string>) };
      delete attrs[name];
      selectedComponent.setAttributes(attrs);
    } else {
      selectedComponent.addAttributes({ [name]: value });
    }
    applyComponentSettings(selectedComponent);
    commitGrapesComponentToDocument(selectedComponent, device);
    selectedComponent.trigger('component:update', selectedComponent);
    setUpdateTrigger(prev => prev + 1);
  };
  const componentTrail = (() => {
    const trail: Component[] = [];
    let cursor: Component | undefined = selectedComponent;
    while (cursor && cursor.get('type') !== 'wrapper') {
      trail.unshift(cursor);
      cursor = cursor.parent();
      if (trail.length > 8) break;
    }
    return trail;
  })();

  return (
    <div className={`wb-inspector-studio ${readOnly ? 'wb-inspector-studio--readonly' : ''}`} aria-readonly={readOnly}>

      {/* ── Component Header ── */}
      <div className="wb-inspector-titlebar">
        {manifest.icon && (
          <div className="wb-inspector-icon">
            <i className={`${manifest.icon} text-primary`} style={{ fontSize: '13px' }} />
          </div>
        )}
        <div className="wb-inspector-selected">
          <div className="wb-inspector-component-name">
            {componentName}
            {manifest.category && (
              <span className="wb-inspector-chip">
                {manifest.category}
              </span>
            )}
          </div>
          <div className="wb-inspector-component-id">
            #{selectedComponent.getId()}
          </div>
        </div>
        {onCollapseInspector && (
          <button
            type="button"
            className="wb-inspector-collapse-btn"
            onClick={onCollapseInspector}
            aria-label="Collapse inspector"
            title="Collapse inspector"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Scrollable Body ── */}
      <div className="wb-inspector-tabs" role="tablist" aria-label="Inspector settings">
        {INSPECTOR_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activePane === id}
            className={`wb-inspector-tab ${activePane === id ? 'active' : ''}`}
            onClick={() => setActivePane(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {componentTrail.length > 1 && (
        <div className="wb-inspector-breadcrumbs">
          <div className="flex items-center gap-1 overflow-x-auto">
            {componentTrail.map((item, index) => {
              const itemType = String(item.get('type') || item.get('tagName') || 'element');
              const itemManifest = Registry.get(itemType) || Registry.getFallback(itemType, item.get('tagName') || '');
              const isSelected = item === selectedComponent;
              return (
                <React.Fragment key={item.getId() || `${itemType}-${index}`}>
                  {index > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                  <button
                    type="button"
                    onClick={() => editor.select(item)}
                    className={`shrink-0 inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold transition-colors ${
                      isSelected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                    title={`Select ${itemManifest.title}`}
                  >
                    {index > 0 && <CornerDownRight className="w-3 h-3" />}
                    {itemManifest.title}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      <div className="wb-inspector-scroll">

        {/* PROPERTIES SECTION HEADER */}
        <div className="wb-properties-toolbar">
          <div className="flex items-center justify-between">
            <span className="wb-properties-label">
              {activePane} settings
              <span className="wb-properties-count">{paneProperties}</span>
            </span>
            <button
              onClick={handleSearchToggle}
              className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${showSearch ? 'bg-primary/20 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
              title="Search properties"
            >
              {showSearch ? <X className="w-3 h-3" /> : <Search className="w-3 h-3" />}
            </button>
          </div>
          {showSearch && (
            <div className="mt-2 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search properties..."
                className="w-full bg-background border border-border rounded-md pl-6 pr-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* PROPERTY GROUPS */}
        {paneGroups.map(group => {
          const groupDef = PROPERTY_GROUPS[group.groupId as keyof typeof PROPERTY_GROUPS];
          if (!groupDef) return null;
          return (
            <AccordionGroup
              key={group.groupId}
              groupDef={groupDef}
              properties={group.properties}
              editor={editor}
              component={selectedComponent}
              searchQuery={searchQuery}
              pages={pages}
              device={device}
            />
          );
        })}

        {/* Empty search state */}
        {searchQuery && paneGroups.every(g => {
          const q = searchQuery.toLowerCase();
          return g.properties.filter(p => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)).length === 0;
        }) && (
          <div className="py-8 text-center text-[11px] text-muted-foreground/50">
            No properties match "{searchQuery}"
          </div>
        )}

        {/* DATA SECTION */}
        {activePane === 'content' && manifest.supportsData && (
          <>
            <div className="px-4 py-2 border-b border-t border-border/40 bg-muted/10 mt-1">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Data</div>
            </div>
            <div className="p-3 space-y-1">
              <label className="block text-[11px] font-medium text-muted-foreground">
                Source
                <select
                  value={selectedAttributes['data-source'] || 'static'}
                  onChange={(event) => updateSelectedAttribute('data-source', event.target.value)}
                  className="mt-1 w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  <option value="static">Static</option>
                  <option value="event-snapshot">Event Snapshot</option>
                </select>
              </label>
              <label className="block text-[11px] font-medium text-muted-foreground">
                Collection
                <select
                  value={selectedAttributes['data-collection'] || 'event'}
                  onChange={(event) => updateSelectedAttribute('data-collection', event.target.value)}
                  className="mt-1 w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  {['event', 'speakers', 'sessions', 'rooms', 'tracks', 'sponsors', 'tickets', 'important-dates', 'committee', 'venue', 'gallery', 'resources', 'testimonials', 'organizers', 'statistics'].map(collection => (
                    <option key={collection} value={collection}>{collection}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] font-medium text-muted-foreground">
                Filter
                <input
                  value={selectedAttributes['data-filter'] || ''}
                  onChange={(event) => updateSelectedAttribute('data-filter', event.target.value)}
                  placeholder="e.g. speakerType=KEYNOTE"
                  className="mt-1 w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </label>
              <label className="block text-[11px] font-medium text-muted-foreground">
                Sort
                <input
                  value={selectedAttributes['data-sort'] || ''}
                  onChange={(event) => updateSelectedAttribute('data-sort', event.target.value)}
                  placeholder="e.g. displayOrder"
                  className="mt-1 w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </label>
              <label className="block text-[11px] font-medium text-muted-foreground">
                Limit
                <input
                  type="number"
                  min={0}
                  value={selectedAttributes['data-limit'] || ''}
                  onChange={(event) => updateSelectedAttribute('data-limit', event.target.value)}
                  placeholder="6"
                  className="mt-1 w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </label>
              <label className="block text-[11px] font-medium text-muted-foreground">
                Fields
                <input
                  value={selectedAttributes['data-fields'] || ''}
                  onChange={(event) => updateSelectedAttribute('data-fields', event.target.value)}
                  placeholder="name,photo,designation"
                  className="mt-1 w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </label>
              <button onClick={() => void onFetchEventData?.()} className="w-full text-left px-3 py-2 hover:bg-muted rounded transition-colors text-[11px] text-muted-foreground flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                {eventStatus === 'mock' ? 'Fetch real event data' : 'Refresh Event Snapshot'}
              </button>
              <div className="w-full text-left px-3 py-2 rounded text-[11px] text-muted-foreground flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                {eventStatus === 'mock' ? 'Using mock fallback' : 'Collection / filter / sort / limit'}
              </div>
            </div>
          </>
        )}

        <div className="h-8" /> {/* bottom spacer */}
      </div>
    </div>
  );
};
