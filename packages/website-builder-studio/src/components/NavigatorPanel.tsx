import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Component, Editor } from 'grapesjs';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Lock,
  MousePointer2,
  Pencil,
  Trash2,
  Unlock,
} from 'lucide-react';
import { Registry } from '../core/properties/PropertyRegistry';

interface NavigatorPanelProps {
  editor: Editor | null;
}

interface NavigatorNode {
  component: Component;
  id: string;
  label: string;
  type: string;
  children: NavigatorNode[];
  hidden: boolean;
  locked: boolean;
}

function componentType(component: Component): string {
  return String(component.get('type') || component.get('tagName') || 'element');
}

function componentLabel(component: Component): string {
  const attrs = component.getAttributes() as Record<string, string>;
  const explicitName = component.get('custom-name') || component.get('name') || attrs['data-name'] || attrs['aria-label'];
  if (typeof explicitName === 'string' && explicitName.trim()) return explicitName.trim();
  const type = componentType(component);
  const manifest = Registry.get(type) || Registry.getFallback(type, component.get('tagName') || '');
  return manifest.title || type;
}

function isHidden(component: Component): boolean {
  const style = component.getStyle() as Record<string, string>;
  return style.display === 'none' || component.get('hidden') === true;
}

function isLocked(component: Component): boolean {
  return component.get('locked') === true || component.get('selectable') === false;
}

function safeGetSelected(editor: Editor): Component | null {
  try {
    return editor.getSelected() || null;
  } catch {
    return null;
  }
}

function buildNode(component: Component): NavigatorNode {
  const children = component.components().models.map(child => buildNode(child));
  return {
    component,
    id: component.getId() || component.cid,
    label: componentLabel(component),
    type: componentType(component),
    children,
    hidden: isHidden(component),
    locked: isLocked(component),
  };
}

const TreeRow: React.FC<{
  node: NavigatorNode;
  depth: number;
  selectedId?: string;
  expanded: Set<string>;
  onToggleExpanded: (id: string) => void;
  onSelect: (component: Component) => void;
  onRename: (component: Component, label: string) => void;
  onToggleHidden: (component: Component) => void;
  onToggleLocked: (component: Component) => void;
  onDuplicate: (component: Component) => void;
  onDelete: (component: Component) => void;
}> = ({
  node,
  depth,
  selectedId,
  expanded,
  onToggleExpanded,
  onSelect,
  onRename,
  onToggleHidden,
  onToggleLocked,
  onDuplicate,
  onDelete,
}) => {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(node.label);
  const isSelected = selectedId === node.id;
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  useEffect(() => setName(node.label), [node.label]);

  const commitRename = () => {
    const next = name.trim();
    if (next) onRename(node.component, next);
    setRenaming(false);
  };

  return (
    <div>
      <div
        className={`wb-nav-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(node.component)}
      >
        <button
          type="button"
          className="wb-nav-icon-btn"
          {...(!hasChildren ? { disabled: true } : {})}
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) onToggleExpanded(node.id);
          }}
          title={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : ''}
        >
          {hasChildren ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span />}
        </button>

        <MousePointer2 size={12} className="wb-nav-type-icon" />

        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename();
              if (event.key === 'Escape') setRenaming(false);
            }}
            className="wb-nav-rename"
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="wb-nav-label" title={`${node.label} (${node.type})`}>
            {node.label}
          </span>
        )}

        <div className="wb-nav-actions">
          <button type="button" className="wb-nav-icon-btn" onClick={(event) => { event.stopPropagation(); setRenaming(true); }} title="Rename">
            <Pencil size={12} />
          </button>
          <button type="button" className="wb-nav-icon-btn" onClick={(event) => { event.stopPropagation(); onToggleHidden(node.component); }} title={node.hidden ? 'Show' : 'Hide'}>
            {node.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button type="button" className="wb-nav-icon-btn" onClick={(event) => { event.stopPropagation(); onToggleLocked(node.component); }} title={node.locked ? 'Unlock' : 'Lock'}>
            {node.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
          <button type="button" className="wb-nav-icon-btn" onClick={(event) => { event.stopPropagation(); onDuplicate(node.component); }} title="Duplicate">
            <Copy size={12} />
          </button>
          <button type="button" className="wb-nav-icon-btn danger" onClick={(event) => { event.stopPropagation(); onDelete(node.component); }} title="Delete">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {hasChildren && isExpanded && node.children.map(child => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
          onSelect={onSelect}
          onRename={onRename}
          onToggleHidden={onToggleHidden}
          onToggleLocked={onToggleLocked}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export const NavigatorPanel: React.FC<NavigatorPanelProps> = ({ editor }) => {
  const [nodes, setNodes] = useState<NavigatorNode[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(() => {
    if (!editor) {
      setNodes([]);
      setSelectedId(undefined);
      return;
    }
    const nextNodes = editor.getComponents().models.map(component => buildNode(component));
    setNodes(nextNodes);
    const selected = safeGetSelected(editor);
    setSelectedId(selected ? selected.getId() || selected.cid : undefined);
    setExpanded(previous => {
      if (previous.size) return previous;
      const defaults = new Set<string>();
      nextNodes.forEach(node => defaults.add(node.id));
      return defaults;
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    refresh();
    const update = () => refresh();
    editor.on('component:add component:remove component:update component:selected component:deselected component:drag:end', update);
    return () => {
      editor.off('component:add component:remove component:update component:selected component:deselected component:drag:end', update);
    };
  }, [editor, refresh]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectComponent = useCallback((component: Component) => {
    if (isLocked(component)) return;
    editor?.select(component);
  }, [editor]);

  const renameComponent = useCallback((component: Component, label: string) => {
    component.set('custom-name', label);
    component.addAttributes({ 'data-name': label });
    refresh();
  }, [refresh]);

  const toggleHidden = useCallback((component: Component) => {
    const style = component.getStyle() as Record<string, string>;
    if (style.display === 'none') {
      const next = { ...style };
      delete next.display;
      component.setStyle(next);
    } else {
      component.addStyle({ display: 'none' });
    }
    refresh();
  }, [refresh]);

  const toggleLocked = useCallback((component: Component) => {
    const locked = isLocked(component);
    component.set({
      locked: !locked,
      selectable: locked,
      hoverable: locked,
      draggable: locked,
      removable: locked,
    });
    refresh();
  }, [refresh]);

  const duplicateComponent = useCallback((component: Component) => {
    const parent = component.parent();
    const json = component.toJSON();
    if (parent) parent.append(json, { at: component.index() + 1 });
    else editor?.addComponents(json);
    refresh();
  }, [editor, refresh]);

  const deleteComponent = useCallback((component: Component) => {
    if (component.get('removable') === false) return;
    component.remove();
    refresh();
  }, [refresh]);

  const totalNodes = useMemo(() => {
    const count = (items: NavigatorNode[]): number => items.reduce((sum, item) => sum + 1 + count(item.children), 0);
    return count(nodes);
  }, [nodes]);

  if (!editor) {
    return <div className="wb-nav-empty">Canvas is loading.</div>;
  }

  return (
    <div className="wb-navigator-panel">
      <div className="wb-panel-heading">
        <span>Navigator</span>
        <span>{totalNodes}</span>
      </div>
      {nodes.length ? (
        <div className="wb-nav-tree">
          {nodes.map(node => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expanded={expanded}
              onToggleExpanded={toggleExpanded}
              onSelect={selectComponent}
              onRename={renameComponent}
              onToggleHidden={toggleHidden}
              onToggleLocked={toggleLocked}
              onDuplicate={duplicateComponent}
              onDelete={deleteComponent}
            />
          ))}
        </div>
      ) : (
        <div className="wb-nav-empty">Drop a component on the canvas to start building this page.</div>
      )}
    </div>
  );
};
