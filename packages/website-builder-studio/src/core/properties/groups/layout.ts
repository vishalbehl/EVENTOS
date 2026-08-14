import type { PropertyDefinition } from '../PropertyRegistry';

export const LayoutGroup: PropertyDefinition[] = [
  {
    id: 'display',
    type: 'Select',
    label: 'Display',
    target: { kind: 'style', css: 'display' },
    options: [
      { value: 'block', label: 'Block' },
      { value: 'flex', label: 'Flex' },
      { value: 'grid', label: 'Grid' },
      { value: 'inline-block', label: 'Inline Block' },
      { value: 'inline-flex', label: 'Inline Flex' },
      { value: 'none', label: 'Hidden' },
    ],
  },
  {
    id: 'flex-direction',
    type: 'Select',
    label: 'Direction',
    target: { kind: 'style', css: 'flex-direction' },
    hiddenWhen: (v) => v.display !== 'flex' && v.display !== 'inline-flex',
    options: [
      { value: 'row', label: 'Horizontal (Row)' },
      { value: 'row-reverse', label: 'Horizontal Reverse' },
      { value: 'column', label: 'Vertical (Column)' },
      { value: 'column-reverse', label: 'Vertical Reverse' },
    ],
  },
  {
    id: 'justify-content',
    type: 'Select',
    label: 'Justify Content',
    target: { kind: 'style', css: 'justify-content' },
    hiddenWhen: (v) => v.display !== 'flex' && v.display !== 'inline-flex',
    options: [
      { value: 'flex-start', label: 'Start' },
      { value: 'center', label: 'Center' },
      { value: 'flex-end', label: 'End' },
      { value: 'space-between', label: 'Space Between' },
      { value: 'space-around', label: 'Space Around' },
      { value: 'space-evenly', label: 'Space Evenly' },
    ],
  },
  {
    id: 'align-items',
    type: 'Select',
    label: 'Align Items',
    target: { kind: 'style', css: 'align-items' },
    hiddenWhen: (v) => v.display !== 'flex' && v.display !== 'inline-flex',
    options: [
      { value: 'flex-start', label: 'Start' },
      { value: 'center', label: 'Center' },
      { value: 'flex-end', label: 'End' },
      { value: 'stretch', label: 'Stretch' },
      { value: 'baseline', label: 'Baseline' },
    ],
  },
  {
    id: 'flex-wrap',
    type: 'Select',
    label: 'Flex Wrap',
    target: { kind: 'style', css: 'flex-wrap' },
    hiddenWhen: (v) => v.display !== 'flex' && v.display !== 'inline-flex',
    options: [
      { value: 'nowrap', label: 'No Wrap' },
      { value: 'wrap', label: 'Wrap' },
      { value: 'wrap-reverse', label: 'Wrap Reverse' },
    ],
  },
  { id: 'gap', type: 'Text', label: 'Gap', placeholder: 'e.g. 16px, 1rem, 16px 24px', target: { kind: 'style', css: 'gap' } },
  { id: 'width', type: 'Text', label: 'Width', placeholder: 'e.g. 100%, 480px, auto', target: { kind: 'style', css: 'width' } },
  { id: 'height', type: 'Text', label: 'Height', placeholder: 'e.g. 100vh, 400px, auto', target: { kind: 'style', css: 'height' } },
  { id: 'max-width', type: 'Text', label: 'Max Width', placeholder: 'e.g. 1100px, 100%', target: { kind: 'style', css: 'max-width' } },
  { id: 'min-height', type: 'Text', label: 'Min Height', placeholder: 'e.g. 200px, 50vh', target: { kind: 'style', css: 'min-height' } },
];

export const SpacingGroup: PropertyDefinition[] = [
  { id: 'margin', type: 'Spacing', label: 'Margin', target: { kind: 'style', css: 'margin' } },
  { id: 'padding', type: 'Spacing', label: 'Padding', target: { kind: 'style', css: 'padding' } },
];
