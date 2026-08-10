import type { PropertyDefinition } from '../PropertyRegistry';

export const BorderGroup: PropertyDefinition[] = [
  { id: 'border-style', type: 'Select', label: 'Border Style', options: [
    { value: 'none', label: 'None' },
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
  ]},
  {
    id: 'border-width',
    type: 'Text',
    label: 'Border Width',
    placeholder: 'e.g. 1px, 2px',
    hiddenWhen: (v) => v['border-style'] === 'none',
  },
  {
    id: 'border-color',
    type: 'Color',
    label: 'Border Color',
    hiddenWhen: (v) => v['border-style'] === 'none',
  },
  { id: 'border-radius', type: 'Text', label: 'Corner Radius', placeholder: 'e.g. 8px, 50%' },
  { id: 'box-shadow', type: 'Text', label: 'Box Shadow', placeholder: 'e.g. 0 4px 24px rgba(0,0,0,0.1)' },
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
  },
  { id: 'mix-blend-mode', type: 'Select', label: 'Blend Mode', options: [
    { value: 'normal', label: 'Normal' },
    { value: 'multiply', label: 'Multiply' },
    { value: 'screen', label: 'Screen' },
    { value: 'overlay', label: 'Overlay' },
    { value: 'darken', label: 'Darken' },
    { value: 'lighten', label: 'Lighten' },
    { value: 'color-dodge', label: 'Color Dodge' },
    { value: 'color-burn', label: 'Color Burn' },
  ]},
  { id: 'filter', type: 'Text', label: 'CSS Filter', placeholder: 'e.g. blur(4px), grayscale(1)' },
  { id: 'backdrop-filter', type: 'Text', label: 'Backdrop Filter', placeholder: 'e.g. blur(20px)' },
  { id: 'transform', type: 'Text', label: 'Transform', placeholder: 'e.g. rotate(5deg), scale(1.1)' },
  { id: 'transition', type: 'Text', label: 'Transition', placeholder: 'e.g. all 0.3s ease' },
];

export const ResponsiveGroup: PropertyDefinition[] = [
  { id: 'data-hide-desktop', type: 'Toggle', label: 'Hide on Desktop' },
  { id: 'data-hide-tablet', type: 'Toggle', label: 'Hide on Tablet' },
  { id: 'data-hide-mobile', type: 'Toggle', label: 'Hide on Mobile' },
  { id: 'data-reverse-cols', type: 'Toggle', label: 'Reverse Columns on Mobile' },
  { id: 'data-stack', type: 'Toggle', label: 'Stack on Mobile' },
];

export const AdvancedGroup: PropertyDefinition[] = [
  { id: 'id', type: 'Text', label: 'HTML ID', placeholder: 'e.g. my-section' },
  { id: 'className', type: 'Text', label: 'CSS Class', placeholder: 'e.g. custom-class' },
  { id: 'z-index', type: 'Number', label: 'Z Index', defaultValue: 0 },
  { id: 'position', type: 'Select', label: 'Position', options: [
    { value: 'static', label: 'Static' },
    { value: 'relative', label: 'Relative' },
    { value: 'absolute', label: 'Absolute' },
    { value: 'fixed', label: 'Fixed' },
    { value: 'sticky', label: 'Sticky' },
  ]},
  { id: 'overflow', type: 'Select', label: 'Overflow', options: [
    { value: 'visible', label: 'Visible' },
    { value: 'hidden', label: 'Hidden' },
    { value: 'auto', label: 'Auto' },
    { value: 'scroll', label: 'Scroll' },
  ]},
  { id: 'cursor', type: 'Select', label: 'Cursor', options: [
    { value: 'default', label: 'Default' },
    { value: 'pointer', label: 'Pointer' },
    { value: 'not-allowed', label: 'Not Allowed' },
    { value: 'grab', label: 'Grab' },
  ]},
  { id: 'pointer-events', type: 'Select', label: 'Pointer Events', options: [
    { value: 'auto', label: 'Auto' },
    { value: 'none', label: 'None' },
  ]},
];
