import type { PropertyDefinition } from '../PropertyRegistry';

export const BorderGroup: PropertyDefinition[] = [
  {
    id: 'border-style',
    type: 'Select',
    label: 'Border Style',
    target: { kind: 'style', css: 'border-style' },
    options: [
      { value: 'none', label: 'None' },
      { value: 'solid', label: 'Solid' },
      { value: 'dashed', label: 'Dashed' },
      { value: 'dotted', label: 'Dotted' },
    ],
  },
  {
    id: 'border-width',
    type: 'Text',
    label: 'Border Width',
    placeholder: 'e.g. 1px, 2px',
    target: { kind: 'style', css: 'border-width' },
    hiddenWhen: (v) => v['border-style'] === 'none',
  },
  {
    id: 'border-color',
    type: 'Color',
    label: 'Border Color',
    target: { kind: 'style', css: 'border-color' },
    hiddenWhen: (v) => v['border-style'] === 'none',
  },
  { id: 'border-radius', type: 'Text', label: 'Corner Radius', placeholder: 'e.g. 8px, 50%', target: { kind: 'style', css: 'border-radius' } },
  { id: 'box-shadow', type: 'Text', label: 'Box Shadow', placeholder: 'e.g. 0 4px 24px rgba(0,0,0,0.1)', target: { kind: 'style', css: 'box-shadow' } },
];

export const EffectsGroup: PropertyDefinition[] = [
  {
    id: 'opacity',
    type: 'Number',
    label: 'Opacity',
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 0.05,
    target: { kind: 'style', css: 'opacity' },
  },
  {
    id: 'mix-blend-mode',
    type: 'Select',
    label: 'Blend Mode',
    target: { kind: 'style', css: 'mix-blend-mode' },
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'multiply', label: 'Multiply' },
      { value: 'screen', label: 'Screen' },
      { value: 'overlay', label: 'Overlay' },
      { value: 'darken', label: 'Darken' },
      { value: 'lighten', label: 'Lighten' },
      { value: 'color-dodge', label: 'Color Dodge' },
      { value: 'color-burn', label: 'Color Burn' },
    ],
  },
  { id: 'filter', type: 'Text', label: 'CSS Filter', placeholder: 'e.g. blur(4px), grayscale(1)', target: { kind: 'style', css: 'filter' } },
  { id: 'backdrop-filter', type: 'Text', label: 'Backdrop Filter', placeholder: 'e.g. blur(20px)', target: { kind: 'style', css: 'backdrop-filter' } },
  { id: 'transform', type: 'Text', label: 'Transform', placeholder: 'e.g. rotate(5deg), scale(1.1)', target: { kind: 'style', css: 'transform' } },
  { id: 'transition', type: 'Text', label: 'Transition', placeholder: 'e.g. all 0.3s ease', target: { kind: 'style', css: 'transition' } },
];

export const ResponsiveGroup: PropertyDefinition[] = [
  { id: 'data-hide-desktop', type: 'Toggle', label: 'Hide on Desktop', target: { kind: 'attribute', name: 'data-hide-desktop' } },
  { id: 'data-hide-tablet', type: 'Toggle', label: 'Hide on Tablet', target: { kind: 'attribute', name: 'data-hide-tablet' } },
  { id: 'data-hide-mobile', type: 'Toggle', label: 'Hide on Mobile', target: { kind: 'attribute', name: 'data-hide-mobile' } },
  { id: 'data-reverse-cols', type: 'Toggle', label: 'Reverse Columns on Mobile', target: { kind: 'attribute', name: 'data-reverse-cols' } },
  { id: 'data-stack', type: 'Toggle', label: 'Stack on Mobile', target: { kind: 'attribute', name: 'data-stack' } },
];

export const AdvancedGroup: PropertyDefinition[] = [
  {
    id: 'tagName',
    type: 'Select',
    label: 'HTML Tag',
    target: { kind: 'component-state', key: 'tagName' },
    options: [
      { value: 'section', label: 'section' },
      { value: 'div', label: 'div' },
      { value: 'header', label: 'header' },
      { value: 'footer', label: 'footer' },
      { value: 'nav', label: 'nav' },
      { value: 'main', label: 'main' },
      { value: 'article', label: 'article' },
      { value: 'aside', label: 'aside' },
      { value: 'h1', label: 'h1' },
      { value: 'h2', label: 'h2' },
      { value: 'h3', label: 'h3' },
      { value: 'p', label: 'p' },
      { value: 'span', label: 'span' },
      { value: 'a', label: 'a' },
      { value: 'button', label: 'button' },
    ],
  },
  { id: 'id', type: 'Text', label: 'HTML ID', placeholder: 'e.g. my-section', target: { kind: 'attribute', name: 'id' } },
  { id: 'className', type: 'Text', label: 'CSS Class', placeholder: 'e.g. custom-class', target: { kind: 'attribute', name: 'class' } },
  { id: 'z-index', type: 'Number', label: 'Z Index', defaultValue: 0, target: { kind: 'style', css: 'z-index' } },
  {
    id: 'position',
    type: 'Select',
    label: 'Position',
    target: { kind: 'style', css: 'position' },
    options: [
      { value: 'static', label: 'Static' },
      { value: 'relative', label: 'Relative' },
      { value: 'absolute', label: 'Absolute' },
      { value: 'fixed', label: 'Fixed' },
      { value: 'sticky', label: 'Sticky' },
    ],
  },
  {
    id: 'overflow',
    type: 'Select',
    label: 'Overflow',
    target: { kind: 'style', css: 'overflow' },
    options: [
      { value: 'visible', label: 'Visible' },
      { value: 'hidden', label: 'Hidden' },
      { value: 'auto', label: 'Auto' },
      { value: 'scroll', label: 'Scroll' },
    ],
  },
  {
    id: 'cursor',
    type: 'Select',
    label: 'Cursor',
    target: { kind: 'style', css: 'cursor' },
    options: [
      { value: 'default', label: 'Default' },
      { value: 'pointer', label: 'Pointer' },
      { value: 'not-allowed', label: 'Not Allowed' },
      { value: 'grab', label: 'Grab' },
    ],
  },
  {
    id: 'pointer-events',
    type: 'Select',
    label: 'Pointer Events',
    target: { kind: 'style', css: 'pointer-events' },
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'none', label: 'None' },
    ],
  },
];
