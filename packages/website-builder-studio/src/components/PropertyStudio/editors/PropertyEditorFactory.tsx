import React, { useState } from 'react';
import type { Component } from 'grapesjs';
import type { PropertyDefinition, SelectProperty, TextProperty, BaseProperty } from '../../../core/properties/PropertyRegistry';
import { usePropertySync, useSpacingSync } from '../../../core/properties/usePropertySync';

interface BaseEditorProps {
  property: PropertyDefinition;
  component: Component;
}

// ---------------------------------------------------------------------------
// TEXT
// ---------------------------------------------------------------------------
export const TextEditor: React.FC<BaseEditorProps> = ({ property, component }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property);
  const prop = property as TextProperty;

  return (
    <div className="mb-3">
      <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">{property.label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => updateValue(e.target.value)}
        placeholder={prop.placeholder || computedValue || property.defaultValue?.toString() || ''}
        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/50"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// TEXTAREA
// ---------------------------------------------------------------------------
export const TextareaEditor: React.FC<BaseEditorProps> = ({ property, component }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property);

  return (
    <div className="mb-3">
      <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">{property.label}</label>
      <textarea
        value={value || ''}
        onChange={(e) => updateValue(e.target.value)}
        placeholder={computedValue || property.defaultValue?.toString() || ''}
        rows={3}
        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-y placeholder:text-muted-foreground/50"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// NUMBER (plain)
// ---------------------------------------------------------------------------
export const NumberEditor: React.FC<BaseEditorProps> = ({ property, component }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property);
  const prop = property as BaseProperty;
  const numericComputed = computedValue ? computedValue.replace(/[^0-9.]/g, '') : '';

  return (
    <div className="mb-3">
      <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">{property.label}</label>
      <input
        type="number"
        value={value !== '' ? value : ''}
        onChange={(e) => updateValue(e.target.value)}
        placeholder={numericComputed || property.defaultValue?.toString() || ''}
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
export const SliderEditor: React.FC<BaseEditorProps> = ({ property, component }) => {
  const { value, updateValue } = usePropertySync(component, property);
  const prop = property as BaseProperty;
  const min = prop.min ?? 0;
  const max = prop.max ?? 100;
  const step = prop.step ?? 1;
  const numericVal = parseFloat(value) || min;

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
export const SelectEditor: React.FC<BaseEditorProps> = ({ property, component }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property);
  const prop = property as SelectProperty;

  let displayValue = value;
  if (!value && computedValue) {
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
export const ToggleEditor: React.FC<BaseEditorProps> = ({ property, component }) => {
  const { value, updateValue } = usePropertySync(component, property);
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

export const ColorEditor: React.FC<BaseEditorProps> = ({ property, component }) => {
  const { value, computedValue, updateValue } = usePropertySync(component, property);

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
            className={`w-5 h-5 rounded-full border shadow-sm transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background ${value === color.var ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110' : 'border-border'}`}
            style={{ backgroundColor: color.var }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value?.startsWith('var') ? '#000000' : (value || '#000000')}
          onChange={(e) => updateValue(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border border-border p-0 bg-transparent"
          title="Custom color"
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => updateValue(e.target.value)}
          placeholder={computedValue || 'var(--primary) or #hex'}
          className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono transition-all placeholder:text-muted-foreground/50"
        />
        {value && (
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

// ---------------------------------------------------------------------------
// SPACING (visual box-model editor)
// ---------------------------------------------------------------------------
// SpacingEditor uses useSpacingSync which writes individual CSS sides (e.g.
// margin-top, margin-right) because GrapesJS does NOT support shorthand margin/padding.
export const SpacingEditor: React.FC<BaseEditorProps> = ({ property, component }) => {
  const prop = property.id as 'margin' | 'padding';
  const { values, computed, updateSide } = useSpacingSync(component, prop);

  const sides = [
    { key: 'top' as const,    label: 'T', pos: 'absolute top-1.5 left-1/2 -translate-x-1/2' },
    { key: 'bottom' as const, label: 'B', pos: 'absolute bottom-1.5 left-1/2 -translate-x-1/2' },
    { key: 'left' as const,   label: 'L', pos: 'absolute left-1.5 top-1/2 -translate-y-1/2' },
    { key: 'right' as const,  label: 'R', pos: 'absolute right-1.5 top-1/2 -translate-y-1/2' },
  ];

  return (
    <div className="mb-4">
      <label className="block text-[11px] font-medium text-muted-foreground mb-2">{property.label}</label>
      <div className="relative w-full max-w-[180px] aspect-[4/3] mx-auto bg-muted/20 border border-border rounded-lg flex items-center justify-center">
        {sides.map(({ key, pos }) => (
          <div key={key} className={pos}>
            <input
              type="text"
              value={values[key]}
              onChange={(e) => updateSide(key, e.target.value)}
              onBlur={(e) => {
                // Auto-append 'px' if user typed a bare number
                const v = e.target.value;
                if (v && /^\d+(\.\d+)?$/.test(v)) updateSide(key, `${v}px`);
              }}
              placeholder={computed[key] ? computed[key].replace('px', '') : '0'}
              className="w-12 h-6 text-center text-[10px] bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono placeholder:text-muted-foreground/50"
            />
          </div>
        ))}
        <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">
          {property.id === 'margin' ? 'MARGIN' : 'PADDING'}
        </div>
      </div>
      {/* Quick presets row */}
      <div className="flex gap-1 mt-2 justify-center">
        {['0', '8px', '16px', '24px', '48px'].map(preset => (
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
export const EventDataSourceEditor: React.FC<BaseEditorProps> = ({ property, component }) => {
  const { value, updateValue } = usePropertySync(component, property);

  return (
    <div className="mb-4">
      <label className="block text-[11px] font-medium text-muted-foreground mb-2">{property.label}</label>
      <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-2">
        <div className="relative">
          <select
            value={value || ''}
            onChange={(e) => updateValue(e.target.value)}
            className="w-full bg-background border border-border rounded-md pl-2.5 pr-7 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all appearance-none"
          >
            <option value="" disabled hidden>Select Data Source...</option>
            <option value="manual">Manual (Static)</option>
            <option value="event-snapshot">Current Event Snapshot</option>
            <option value="collection">Global Collection</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
            <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {value === 'event-snapshot' && (
          <div className="text-[10px] bg-primary/10 text-primary p-2 rounded flex items-center gap-1.5">
            <span>●</span> Connected to Live Event Data
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ASSET (Image / File picker)
// ---------------------------------------------------------------------------
export const AssetEditor: React.FC<BaseEditorProps> = ({ property, component }) => {
  const { value, updateValue } = usePropertySync(component, property);

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
            onClick={() => alert('Asset Library will open here.')}
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
    case 'Spacing':     return <SpacingEditor {...props} />;
    case 'EventDataSource': return <EventDataSourceEditor {...props} />;
    case 'Asset':       return <AssetEditor {...props} />;
    default:
      return (
        <div className="mb-3 opacity-40">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">{property.label}</label>
          <div className="text-[10px] text-muted-foreground border border-dashed border-border rounded p-2 text-center bg-background/50">
            [{type}] Editor coming soon
          </div>
        </div>
      );
  }
};
