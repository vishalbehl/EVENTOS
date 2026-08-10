import React, { useEffect, useState, useMemo, useCallback } from 'react';
import type { Editor, Component } from 'grapesjs';
import { ChevronRight, ChevronDown, Settings2, Search, X } from 'lucide-react';
import { Registry, PROPERTY_GROUPS } from '../../core/properties/PropertyRegistry';
import type { ComponentManifest, PropertyGroupDef, PropertyDefinition } from '../../core/properties/PropertyRegistry';
import { PropertyEditorFactory } from './editors/PropertyEditorFactory';

interface PropertyStudioProps {
  editor: Editor | null;
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
}> = ({ groupDef, properties, editor, component, searchQuery }) => {
  const [isExpanded, setIsExpanded] = useState(groupDef.defaultExpanded ?? false);

  // Filter properties by search query
  const visibleProperties = useMemo(() => {
    if (!searchQuery) return properties;
    const q = searchQuery.toLowerCase();
    return properties.filter(p =>
      p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [properties, searchQuery]);

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
            <PropertyEditorFactory key={prop.id} property={prop} component={component} />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Property Studio
// ---------------------------------------------------------------------------
export const PropertyStudio: React.FC<PropertyStudioProps> = ({ editor }) => {
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [, setUpdateTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

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

    const selected = editor.getSelected();
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
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground space-y-3 opacity-50">
        <Settings2 className="w-7 h-7" />
        <p className="text-xs leading-relaxed">Select an element on the canvas<br />to edit its properties.</p>
      </div>
    );
  }

  const componentName = manifest.title || selectedComponent.getName() || selectedComponent.get('type') || '';
  const totalProperties = manifest.schema.groups.reduce((acc, g) => acc + g.properties.length, 0);

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Component Header ── */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border bg-muted/20 flex items-center gap-2.5">
        {manifest.icon && (
          <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <i className={`${manifest.icon} text-primary`} style={{ fontSize: '13px' }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-foreground truncate flex items-center gap-1.5">
            {componentName}
            {manifest.category && (
              <span className="px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary text-[9px] uppercase tracking-wider font-bold shrink-0">
                {manifest.category}
              </span>
            )}
          </div>
          <div className="text-[9px] text-muted-foreground/50 mt-0.5 font-mono truncate">
            #{selectedComponent.getId()}
          </div>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto">

        {/* PROPERTIES SECTION HEADER */}
        <div className="px-4 py-2 border-b border-border/40 bg-muted/10 sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
              Properties
              <span className="ml-1.5 text-muted-foreground/40 font-normal">{totalProperties}</span>
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
        {manifest.schema.groups.map(group => {
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
            />
          );
        })}

        {/* Empty search state */}
        {searchQuery && manifest.schema.groups.every(g => {
          const q = searchQuery.toLowerCase();
          return g.properties.filter(p => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)).length === 0;
        }) && (
          <div className="py-8 text-center text-[11px] text-muted-foreground/50">
            No properties match "{searchQuery}"
          </div>
        )}

        {/* DATA SECTION */}
        {manifest.supportsData && (
          <>
            <div className="px-4 py-2 border-b border-t border-border/40 bg-muted/10 mt-1">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Data Binding</div>
            </div>
            <div className="p-3 space-y-1">
              <button className="w-full text-left px-3 py-2 hover:bg-muted rounded text-foreground transition-colors text-[11px] font-medium border border-border/50 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                Manual Data
              </button>
              <button className="w-full text-left px-3 py-2 hover:bg-muted rounded transition-colors text-[11px] text-muted-foreground flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                Import Event Snapshot
              </button>
              <button className="w-full text-left px-3 py-2 hover:bg-muted rounded transition-colors text-[11px] text-muted-foreground flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                Global Variables
              </button>
            </div>
          </>
        )}

        {/* PRESETS SECTION */}
        <div className="px-4 py-2 border-b border-t border-border/40 bg-muted/10 mt-1">
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Presets</div>
        </div>
        <div className="p-3 grid grid-cols-2 gap-1.5">
          <button className="flex items-center gap-1.5 justify-center px-3 py-1.5 bg-muted/30 hover:bg-muted rounded transition-colors text-[10px] text-muted-foreground border border-border/40">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            Save
          </button>
          <button className="flex items-center gap-1.5 justify-center px-3 py-1.5 bg-muted/30 hover:bg-muted rounded transition-colors text-[10px] text-muted-foreground border border-border/40">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            Load
          </button>
          <button className="col-span-2 flex items-center gap-1.5 justify-center px-3 py-1.5 bg-muted/30 hover:bg-destructive/10 hover:text-destructive rounded transition-colors text-[10px] text-muted-foreground border border-border/40">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Reset to Default
          </button>
        </div>

        {/* PREVIEW CONTEXT */}
        <div className="px-4 py-2 border-b border-t border-border/40 bg-muted/10 mt-1">
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Preview Context</div>
        </div>
        <div className="p-3 flex gap-1">
          <button
            onClick={() => editor.setDevice('Desktop')}
            className="flex-1 py-1.5 rounded text-[10px] font-medium transition-colors bg-primary/10 text-primary border border-primary/20"
          >
            Desktop
          </button>
          <button
            onClick={() => editor.setDevice('Tablet')}
            className="flex-1 py-1.5 bg-muted/40 hover:bg-muted rounded text-[10px] text-muted-foreground transition-colors"
          >
            Tablet
          </button>
          <button
            onClick={() => editor.setDevice('Mobile portrait')}
            className="flex-1 py-1.5 bg-muted/40 hover:bg-muted rounded text-[10px] text-muted-foreground transition-colors"
          >
            Mobile
          </button>
        </div>

        <div className="h-8" /> {/* bottom spacer */}
      </div>
    </div>
  );
};
