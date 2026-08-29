import React, { useEffect, useState } from 'react';
import type { Component } from 'grapesjs';
import type { PropertyDefinition, SelectProperty, TextProperty, BaseProperty } from '../../../core/properties/PropertyRegistry';
import { commitGrapesComponentToDocument, findTargetComponent, readPropertyTarget, usePropertySync, useSpacingSync } from '../../../core/properties/usePropertySync';
import type { PageConfig, ResponsiveDevice } from '../../../types';
import { SOCIAL_ICON_OPTIONS, lucideIconUrl, socialIconName } from '../../../core/iconLibrary';
import { useWebsiteDocumentStore } from '../../../core/websiteDocumentStore';


interface BaseEditorProps {
  property: PropertyDefinition;
  component: Component;
  pages?: PageConfig[];
  device?: ResponsiveDevice;
}

function effectiveValue(value: any, computedValue: any, defaultValue: any = ''): any {
  if (value !== null && typeof value !== 'undefined' && value !== '') return value;
  if (computedValue !== null && typeof computedValue !== 'undefined' && computedValue !== '') return computedValue;
  return defaultValue ?? '';
}

function canvasDocument(component: Component): Document | null {
  const el = component.getView()?.el;
  return el?.ownerDocument || null;
}

function resolveCssColor(component: Component, raw: string): string {
  if (!raw) return '#000000';
  const doc = canvasDocument(component);
  if (!doc) return raw.startsWith('#') ? raw : '#000000';
  const probe = doc.createElement('span');
  probe.style.position = 'absolute';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  probe.style.color = raw;
  doc.body.appendChild(probe);
  const resolved = doc.defaultView?.getComputedStyle(probe).color || raw;
  probe.remove();
  const rgb = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgb) return raw.startsWith('#') ? raw : '#000000';
  return `#${[rgb[1], rgb[2], rgb[3]].map(part => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------------------
// TEXT
// ---------------------------------------------------------------------------
export const TextEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property, device);
  const prop = property as TextProperty;
  const displayValue = effectiveValue(value, computedValue, property.defaultValue);

  return (
    <div className="mb-3">
      <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">{property.label}</label>
      <input
        type="text"
        value={displayValue || ''}
        onChange={(e) => updateValue(e.target.value)}
        placeholder={prop.placeholder || property.defaultValue?.toString() || ''}
        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/50"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// TEXTAREA
// ---------------------------------------------------------------------------
export const TextareaEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property, device);
  const displayValue = effectiveValue(value, computedValue, property.defaultValue);

  return (
    <div className="mb-3">
      <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">{property.label}</label>
      <textarea
        value={displayValue || ''}
        onChange={(e) => updateValue(e.target.value)}
        placeholder={property.defaultValue?.toString() || ''}
        rows={3}
        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-y placeholder:text-muted-foreground/50"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// NUMBER (plain)
// ---------------------------------------------------------------------------
export const NumberEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property, device);
  const prop = property as BaseProperty;
  const numericComputed = String(effectiveValue(value, computedValue, property.defaultValue)).replace(/[^0-9.-]/g, '');

  return (
    <div className="mb-3">
      <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">{property.label}</label>
      <input
        type="number"
        value={value !== '' && typeof value !== 'undefined' ? value : numericComputed}
        onChange={(e) => updateValue(e.target.value)}
        placeholder={property.defaultValue?.toString() || ''}
        min={prop.min}
        max={prop.max}
        step={prop.step}
        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/50"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// SLIDER (for Number with min+max+step)
// ---------------------------------------------------------------------------
export const SliderEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property, device);
  const prop = property as BaseProperty;
  const min = prop.min ?? 0;
  const max = prop.max ?? 100;
  const step = prop.step ?? 1;
  const numericVal = parseFloat(effectiveValue(value, computedValue, property.defaultValue || min)) || min;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">{property.label}</label>
        <span className="text-[11px] font-mono text-foreground bg-muted/40 px-1.5 py-0.5 rounded border border-border">
          {numericVal}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numericVal}
          onChange={(e) => updateValue(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-primary cursor-pointer"
          style={{ accentColor: 'var(--primary)' }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------
export const SelectEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property, device);
  const prop = property as SelectProperty;

  let displayValue = effectiveValue(value, '', property.defaultValue);
  if (!displayValue && computedValue) {
    const matchedOpt = prop.options?.find(o => o.value === computedValue);
    if (matchedOpt) displayValue = matchedOpt.value;
  }

  return (
    <div className="mb-3">
      <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">{property.label}</label>
      <div className="relative">
        <select
          value={displayValue || ''}
          onChange={(e) => updateValue(e.target.value)}
          className={`w-full bg-background border border-border rounded-md pl-2.5 pr-7 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all appearance-none ${!value && computedValue ? 'text-muted-foreground/60' : 'text-foreground'}`}
        >
          <option value="" disabled hidden>
            {property.defaultValue ? String(property.defaultValue) : 'Select...'}
          </option>
          {prop.options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// TOGGLE
// ---------------------------------------------------------------------------
export const ToggleEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, updateValue } = usePropertySync(component, property, device);
  const isChecked = value === true || value === 'true' || value === '1';

  return (
    <div className="mb-3 flex items-center justify-between">
      <label className="text-[11px] font-medium text-muted-foreground">{property.label}</label>
      <button
        type="button"
        role="switch"
        aria-checked={isChecked}
        onClick={() => updateValue(isChecked ? 'false' : 'true')}
        className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${isChecked ? 'bg-primary' : 'bg-muted'}`}
      >
        <span className="sr-only">Toggle {property.label}</span>
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isChecked ? 'translate-x-3' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// COLOR
// ---------------------------------------------------------------------------
const THEME_COLORS = [
  { name: 'Primary', var: 'var(--primary)' },
  { name: 'Secondary', var: 'var(--secondary)' },
  { name: 'Accent', var: 'var(--accent)' },
  { name: 'Muted', var: 'var(--muted)' },
  { name: 'Background', var: 'var(--background)' },
  { name: 'Foreground', var: 'var(--foreground)' },
  { name: 'Destructive', var: 'var(--destructive)' },
  { name: 'Border', var: 'var(--border)' },
];

export const ColorEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property, device);
  const displayValue = effectiveValue(value, computedValue, property.defaultValue);
  const pickerValue = resolveCssColor(component, String(displayValue || '#000000'));

  return (
    <div className="mb-4">
      <label className="block text-[11px] font-medium text-muted-foreground mb-2">{property.label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {THEME_COLORS.map(color => (
          <button
            key={color.name}
            type="button"
            title={color.name}
            onClick={() => updateValue(color.var)}
            className={`w-5 h-5 rounded-full border shadow-sm transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background ${displayValue === color.var ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110' : 'border-border'}`}
            style={{ backgroundColor: resolveCssColor(component, color.var) }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={pickerValue}
          onChange={(e) => updateValue(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border border-border p-0 bg-transparent"
          title="Custom color"
        />
        <input
          type="text"
          value={displayValue || ''}
          onChange={(e) => updateValue(e.target.value)}
          placeholder="var(--primary) or #hex"
          className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono transition-all placeholder:text-muted-foreground/50"
        />
        {displayValue && (
          <button
            type="button"
            onClick={() => updateValue('')}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors shrink-0"
            title="Clear"
          >✕</button>
        )}
      </div>
    </div>
  );
};

export const DateTimeEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property, device);
  const toLocalValue = (raw: string) => {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  const fromLocalValue = (raw: string) => raw ? new Date(raw).toISOString() : '';

  return (
    <div className="mb-3">
      <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">{property.label}</label>
      <input
        type="datetime-local"
        value={toLocalValue(effectiveValue(value, computedValue, property.defaultValue) || '')}
        onChange={(event) => updateValue(fromLocalValue(event.target.value))}
        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// SPACING (visual box-model editor)
// ---------------------------------------------------------------------------
// SpacingEditor uses useSpacingSync which writes individual CSS sides (e.g.
// margin-top, margin-right) because GrapesJS does NOT support shorthand margin/padding.
export const SpacingEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const prop = property.id as 'margin' | 'padding';
  const { values, computed, updateSide } = useSpacingSync(component, prop, device);
  const units = ['px', '%', 'rem', 'em', 'vh', 'vw', 'auto'];
  const parseCssValue = (raw: string) => {
    const value = raw || '';
    if (value === 'auto') return { number: '', unit: 'auto' };
    const match = value.match(/^(-?\d+(?:\.\d+)?)(px|%|rem|em|vh|vw)?$/);
    return {
      number: match?.[1] ?? value.replace(/[^\d.-]/g, ''),
      unit: match?.[2] ?? 'px',
    };
  };
  const commitSide = (side: keyof typeof values, number: string, unit: string) => {
    if (unit === 'auto') {
      updateSide(side, 'auto');
      return;
    }
    if (!number.trim()) {
      updateSide(side, '');
      return;
    }
    updateSide(side, `${number}${unit}`);
  };

  const sides = [
    { key: 'top' as const, label: 'Top' },
    { key: 'right' as const, label: 'Right' },
    { key: 'bottom' as const, label: 'Bottom' },
    { key: 'left' as const, label: 'Left' },
  ];

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-medium text-muted-foreground">{property.label}</label>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{device || 'desktop'}</span>
      </div>
      <div className="space-y-1.5 rounded-lg border border-border bg-muted/10 p-2">
        {sides.map(({ key, label }) => {
          const sideValue = values[key] || computed[key] || '0px';
          const parsed = parseCssValue(sideValue);
          const computedHint = computed[key] || '0px';
          return (
            <div key={key} className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_58px] overflow-hidden rounded-md border border-border bg-background focus-within:border-primary">
                <input
                  type="number"
                  value={parsed.number}
                  onChange={(e) => commitSide(key, e.target.value, parsed.unit)}
                  {...(parsed.unit === 'auto' ? { disabled: true } : {})}
                  placeholder={computedHint.replace(/[^\d.-]/g, '') || '0'}
                  className="h-7 min-w-0 border-0 bg-transparent px-2 text-[11px] font-mono text-foreground outline-none disabled:opacity-50"
                />
                <select
                  value={parsed.unit}
                  onChange={(e) => commitSide(key, parsed.number, e.target.value)}
                  className="h-7 border-0 border-l border-border bg-muted/20 px-1 text-[11px] font-semibold text-foreground outline-none"
                >
                  {units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-2 justify-center">
        {['0px', '8px', '16px', '24px', '48px'].map(preset => (
          <button
            key={preset}
            type="button"
            onClick={() => { updateSide('top', preset); updateSide('right', preset); updateSide('bottom', preset); updateSide('left', preset); }}
            className="px-1.5 py-0.5 text-[9px] bg-muted/40 hover:bg-muted rounded border border-border/50 text-muted-foreground hover:text-foreground transition-colors font-mono"
          >{preset}</button>
        ))}
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// EVENT DATA SOURCE
// ---------------------------------------------------------------------------
export const EventDataSourceEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, updateValue } = usePropertySync(component, property, device);
  const attributes = component.getAttributes() as Record<string, string>;
  const instanceId = attributes['data-wb-instance-id'];

  const handleDisconnect = () => {
    if (!instanceId) return;
    useWebsiteDocumentStore.getState().disconnectInstanceEvent(instanceId);
    updateValue('manual');
  };

  const handleReconnect = () => {
    if (!instanceId) return;
    useWebsiteDocumentStore.getState().reconnectInstanceEvent(instanceId);
    updateValue('current-event');
  };

  return (
    <div className="mb-4">
      <label className="block text-[11px] font-medium text-muted-foreground mb-2">{property.label}</label>
      <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-2.5">
        <div className="relative">
          <select
            value={value || 'current-event'}
            onChange={(e) => {
              const nextVal = e.target.value;
              if (nextVal === 'manual' && instanceId) {
                useWebsiteDocumentStore.getState().disconnectInstanceEvent(instanceId);
              } else if (nextVal === 'current-event' && instanceId) {
                useWebsiteDocumentStore.getState().reconnectInstanceEvent(instanceId);
              }
              updateValue(nextVal);
            }}
            className="w-full bg-background border border-border rounded-md pl-2.5 pr-7 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all appearance-none"
          >
            <option value="current-event">Current event (Live)</option>
            <option value="snapshot">Saved snapshot</option>
            <option value="manual">Manual override (Static)</option>
            <option value="mock">Mock fallback</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
            <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {(value === 'current-event' || value === 'snapshot' || !value) && (
          <div className="space-y-2">
            <div className="text-[10px] bg-primary/10 text-primary p-2 rounded flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true">&#9679;</span> {value === 'snapshot' ? 'Using saved snapshot' : 'Connected to live event'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full py-1 px-2 text-[10px] bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground border border-border rounded transition-colors"
            >
              Freeze & Edit Manually
            </button>
          </div>
        )}

        {value === 'manual' && (
          <div className="space-y-2">
            <div className="rounded bg-muted/40 p-2 text-[10px] text-muted-foreground">
              Manual mode active: Live event updates will not overwrite your edits.
            </div>
            <button
              type="button"
              onClick={handleReconnect}
              className="w-full py-1 px-2 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded transition-colors"
            >
              Reconnect Live Event Data
            </button>
          </div>
        )}

        {value === 'mock' && (
          <div className="rounded bg-amber-500/10 p-2 text-[10px] text-amber-300">Using builder mock data (template mode)</div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ASSET (Image / File picker)
// ---------------------------------------------------------------------------
export const AssetEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, updateValue } = usePropertySync(component, property, device);

  return (
    <div className="mb-4">
      <label className="block text-[11px] font-medium text-muted-foreground mb-2">{property.label}</label>
      <div className="flex flex-col gap-2">
        {value && (value.startsWith('http') || value.startsWith('/') || value.startsWith('data:')) && (
          <div className="w-full h-20 bg-muted/30 border border-border rounded-md overflow-hidden flex items-center justify-center">
            <img src={value} alt="Asset preview" className="max-w-full max-h-full object-contain" />
          </div>
        )}
        <div className="flex gap-1.5">
          <input
            type="text"
            value={value || ''}
            onChange={(e) => updateValue(e.target.value)}
            placeholder="https://... or /path/to/file"
            className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
          />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('wb:open-asset-picker', {
              detail: {
                select: (asset: { url?: string; svg?: string }) => {
                  const source = asset.url || (asset.svg
                    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset.svg)}`
                    : '');
                  if (source) updateValue(source);
                },
              },
            }))}
            className="px-2.5 py-1.5 bg-primary/10 text-primary text-xs font-medium rounded-md hover:bg-primary/20 transition-colors shrink-0 border border-primary/20"
            title="Browse assets"
          >
            Browse
          </button>
          {value && (
            <button
              type="button"
              onClick={() => updateValue('')}
              className="px-2 py-1.5 bg-muted/30 text-muted-foreground text-xs rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
              title="Clear"
            >✕</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// LINK (page-aware href and cross-page anchor editor)
// ---------------------------------------------------------------------------
export const LinkEditor: React.FC<BaseEditorProps> = ({ property, component, pages = [], device }) => {
  const { value, updateValue } = usePropertySync(component, property, device);
  const [linkType, setLinkType] = useState<'page' | 'anchor' | 'external' | 'email' | 'phone' | 'file' | 'registration' | 'speaker-portal' | 'custom-route'>('page');
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [selectedAnchor, setSelectedAnchor] = useState<string>('');
  const [anchorIds, setAnchorIds] = useState<string[]>([]);

  useEffect(() => {
    const raw = String(value || '');
    if (raw === '/registration') {
      setLinkType('registration');
    } else if (raw === '/speaker-portal') {
      setLinkType('speaker-portal');
    } else if (raw.startsWith('#')) {
      setLinkType('anchor');
      setSelectedAnchor(raw.replace(/^#/, ''));
    } else if (raw.startsWith('mailto:')) {
      setLinkType('email');
    } else if (raw.startsWith('tel:')) {
      setLinkType('phone');
    } else if (/^https?:\/\//i.test(raw)) {
      setLinkType('external');
    } else if (raw) {
      const [route, hash = ''] = raw.split('#', 2);
      const matchedPage = pages.find(page => (page.isHomePage ? '/' : `/${page.slug}`) === route);
      if (matchedPage) {
        setLinkType('page');
        setSelectedPageId(matchedPage.id);
        setSelectedAnchor(hash);
      }
    }
  }, [pages, value]);

  useEffect(() => {
    const doc = canvasDocument(component);
    const canvasIds = doc
      ? Array.from(doc.querySelectorAll<HTMLElement>('[id]')).map(el => el.id).filter(Boolean)
      : [];

    // Also collect anchors from canonical document instances
    const documentState = useWebsiteDocumentStore.getState().document;
    const documentIds: string[] = [];
    if (documentState) {
      Object.values(documentState.instances).forEach(inst => {
        const attrs = inst.props.attributes as Record<string, unknown> | undefined;
        if (attrs && typeof attrs.id === 'string' && attrs.id.trim()) {
          documentIds.push(attrs.id.trim());
        }
      });
    }

    const allIds = Array.from(new Set([...canvasIds, ...documentIds])).sort((a, b) => a.localeCompare(b));
    setAnchorIds(allIds);
  }, [component, value]);

  const commitLinkChange = (type: typeof linkType, pageId: string, anchor: string, customVal: string) => {
    let finalHref = '';
    const instanceAttributes = component.getAttributes() as Record<string, string>;
    const instanceId = instanceAttributes['data-wb-instance-id'];

    if (type === 'page') {
      const targetPage = pages.find(p => p.id === pageId) || pages.find(p => p.isHomePage) || pages[0];
      const route = targetPage ? (targetPage.isHomePage ? '/' : `/${targetPage.slug}`) : '/';
      const hash = anchor ? `#${anchor.replace(/^#/, '')}` : '';
      finalHref = `${route}${hash}`;

      if (instanceId && targetPage) {
        useWebsiteDocumentStore.getState().updateLink(instanceId, {
          type: 'page',
          pageId: targetPage.id,
          anchorId: anchor || undefined,
        });
      }
    } else if (type === 'anchor') {
      finalHref = anchor.startsWith('#') ? anchor : `#${anchor}`;
      if (instanceId) {
        useWebsiteDocumentStore.getState().updateLink(instanceId, {
          type: 'anchor',
          anchorId: anchor.replace(/^#/, ''),
        });
      }
    } else if (type === 'registration') {
      finalHref = '/registration';
      if (instanceId) {
        useWebsiteDocumentStore.getState().updateLink(instanceId, { type: 'registration' });
      }
    } else if (type === 'speaker-portal') {
      finalHref = '/speaker-portal';
      if (instanceId) {
        useWebsiteDocumentStore.getState().updateLink(instanceId, { type: 'speaker-portal' });
      }
    } else if (type === 'email') {
      finalHref = customVal.startsWith('mailto:') ? customVal : `mailto:${customVal}`;
      if (instanceId) {
        useWebsiteDocumentStore.getState().updateLink(instanceId, { type: 'email', email: customVal });
      }
    } else if (type === 'phone') {
      finalHref = customVal.startsWith('tel:') ? customVal : `tel:${customVal}`;
      if (instanceId) {
        useWebsiteDocumentStore.getState().updateLink(instanceId, { type: 'phone', phone: customVal });
      }
    } else if (type === 'external' || type === 'file') {
      finalHref = customVal;
      if (instanceId) {
        useWebsiteDocumentStore.getState().updateLink(instanceId, { type, url: customVal });
      }
    } else if (type === 'custom-route') {
      finalHref = customVal;
      if (instanceId) {
        useWebsiteDocumentStore.getState().updateLink(instanceId, { type: 'custom-route', route: customVal });
      }
    }

    updateValue(finalHref);
    const mapping = readPropertyTarget(property);
    const target = findTargetComponent(component, mapping.selector);
    const attrs = { ...(target.getAttributes() as Record<string, string>) };
    attrs['data-link-type'] = type;
    if (type === 'page') attrs['data-page-id'] = pageId;
    if (anchor) attrs['data-anchor-id'] = anchor.replace(/^#/, '');
    target.setAttributes(attrs);
    commitGrapesComponentToDocument(target);
    if (target !== component) commitGrapesComponentToDocument(component);
  };

  return (
    <div className="mb-3 space-y-2">
      <label className="block text-[11px] font-medium text-muted-foreground">{property.label}</label>
      <div className="grid grid-cols-2 gap-1.5">
        <select
          value={linkType}
          onChange={(e) => {
            const nextType = e.target.value as any;
            setLinkType(nextType);
            commitLinkChange(nextType, selectedPageId, selectedAnchor, value || '');
          }}
          className="bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="page">Page</option>
          <option value="anchor">Section anchor</option>
          <option value="external">External URL</option>
          <option value="registration">Registration portal</option>
          <option value="speaker-portal">Speaker portal</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="file">File download</option>
          <option value="custom-route">Custom route</option>
        </select>

        {linkType === 'page' ? (
          <select
            value={selectedPageId || pages[0]?.id || ''}
            onChange={(e) => {
              setSelectedPageId(e.target.value);
              commitLinkChange('page', e.target.value, selectedAnchor, value || '');
            }}
            className="bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {pages.map(page => (
              <option key={page.id} value={page.id}>{page.name}</option>
            ))}
          </select>
        ) : linkType === 'anchor' ? (
          <select
            value={selectedAnchor}
            onChange={(e) => {
              setSelectedAnchor(e.target.value);
              commitLinkChange('anchor', selectedPageId, e.target.value, value || '');
            }}
            className="bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Choose section...</option>
            {anchorIds.map(id => (
              <option key={id} value={id}>#{id}</option>
            ))}
          </select>
        ) : linkType === 'registration' || linkType === 'speaker-portal' ? (
          <div className="bg-muted/30 border border-border rounded-md px-2 py-1.5 text-xs text-muted-foreground font-mono truncate">
            {linkType === 'registration' ? '/registration' : '/speaker-portal'}
          </div>
        ) : (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => commitLinkChange(linkType, selectedPageId, selectedAnchor, e.target.value)}
            placeholder={linkType === 'email' ? 'hello@event.com' : linkType === 'phone' ? '+1 555...' : 'https://...'}
            className="bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}
      </div>

      {linkType === 'page' && anchorIds.length > 0 && (
        <div className="grid grid-cols-[80px_1fr] items-center gap-1.5 pt-1">
          <span className="text-[10px] text-muted-foreground">Section anchor:</span>
          <select
            value={selectedAnchor}
            onChange={(e) => {
              setSelectedAnchor(e.target.value);
              commitLinkChange('page', selectedPageId || pages[0]?.id || '', e.target.value, value || '');
            }}
            className="bg-background border border-border rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">(None - top of page)</option>
            {anchorIds.map(id => (
              <option key={id} value={id}>#{id}</option>
            ))}
          </select>
        </div>
      )}

      <div className="text-[9px] text-muted-foreground/60 truncate">Resolved: {value || 'No link set'}</div>
    </div>
  );
};


type SocialLinkItem = {
  platform: string;
  label: string;
  url: string;
};

const defaultSocialLinks = (): SocialLinkItem[] => SOCIAL_ICON_OPTIONS.slice(0, 4).map(option => ({
  platform: option.platform,
  label: option.label,
  url: option.url,
}));

function parseSocialLinks(raw: unknown): SocialLinkItem[] {
  if (!raw) return defaultSocialLinks();
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return defaultSocialLinks();
    return parsed.map((item, index) => {
      const platform = String(item.platform || item.icon || `social-${index + 1}`).toLowerCase();
      const option = SOCIAL_ICON_OPTIONS.find(candidate => candidate.platform === platform);
      return {
        platform,
        label: String(item.label || option?.label || platform),
        url: String(item.url || item.href || option?.url || '#'),
      };
    });
  } catch {
    return defaultSocialLinks();
  }
}

export const SocialLinksEditor: React.FC<BaseEditorProps> = ({ property, component, device }) => {
  const { value, updateValue } = usePropertySync(component, property, device);
  const items = parseSocialLinks(value);

  const commit = (next: SocialLinkItem[]) => {
    updateValue(JSON.stringify(next));
  };

  const updateItem = (index: number, patch: Partial<SocialLinkItem>) => {
    const next = items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    const changed = next[index];
    if (patch.platform) {
      const option = SOCIAL_ICON_OPTIONS.find(candidate => candidate.platform === patch.platform);
      next[index] = {
        ...changed,
        label: option?.label || changed.label,
        url: changed.url && changed.url !== '#' ? changed.url : option?.url || '#',
      };
    }
    commit(next);
  };

  const addItem = () => {
    const option = SOCIAL_ICON_OPTIONS.find(candidate => !items.some(item => item.platform === candidate.platform)) || SOCIAL_ICON_OPTIONS[0];
    commit([...items, { platform: option.platform, label: option.label, url: option.url }]);
  };

  const removeItem = (index: number) => {
    commit(items.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-medium text-muted-foreground">{property.label}</label>
        <button
          type="button"
          onClick={addItem}
          className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20"
        >
          Add icon
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => {
          const iconUrl = lucideIconUrl(socialIconName(item.platform));
          return (
            <div key={`${item.platform}-${index}`} className="rounded-md border border-border bg-muted/10 p-2">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-5 w-5 shrink-0 text-primary"
                  style={{
                    backgroundColor: 'currentColor',
                    WebkitMask: `url("${iconUrl}") center / contain no-repeat`,
                    mask: `url("${iconUrl}") center / contain no-repeat`,
                  }}
                />
                <select
                  value={item.platform}
                  onChange={event => updateItem(index, { platform: event.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {SOCIAL_ICON_OPTIONS.map(option => (
                    <option key={option.platform} value={option.platform}>{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                >
                  Remove
                </button>
              </div>
              <input
                type="text"
                value={item.label}
                onChange={event => updateItem(index, { label: event.target.value })}
                placeholder="Label"
                className="mb-1.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="text"
                value={item.url}
                onChange={event => updateItem(index, { url: event.target.value })}
                placeholder="https://..."
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// FACTORY — dispatches to the right editor
// ---------------------------------------------------------------------------
export const PropertyEditorFactory: React.FC<BaseEditorProps> = (props) => {
  const { property } = props;
  const { type } = property;
  const prop = property as BaseProperty;

  // Number with min+max+step → Slider for better UX
  if (type === 'Number' && prop.min !== undefined && prop.max !== undefined && prop.step !== undefined) {
    return <SliderEditor {...props} />;
  }

  switch (type) {
    case 'Text':        return <TextEditor {...props} />;
    case 'Textarea':    return <TextareaEditor {...props} />;
    case 'Number':      return <NumberEditor {...props} />;
    case 'Select':      return <SelectEditor {...props} />;
    case 'Toggle':      return <ToggleEditor {...props} />;
    case 'Color':       return <ColorEditor {...props} />;
    case 'DateTime':    return <DateTimeEditor {...props} />;
    case 'Spacing':     return <SpacingEditor {...props} />;
    case 'EventDataSource': return <EventDataSourceEditor {...props} />;
    case 'Asset':       return <AssetEditor {...props} />;
    case 'Link':        return <LinkEditor {...props} />;
    case 'SocialLinks': return <SocialLinksEditor {...props} />;
    default:
      return null;
  }
};
