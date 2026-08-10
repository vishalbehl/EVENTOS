import type { PropertyDefinition } from '../PropertyRegistry';

export const LayoutGroup: PropertyDefinition[] = [
  { id: 'display', type: 'Select', label: 'Display', options: [
    { value: 'block', label: 'Block' },
    { value: 'flex', label: 'Flex' },
    { value: 'grid', label: 'Grid' },
    { value: 'inline-block', label: 'Inline Block' },
    { value: 'inline-flex', label: 'Inline Flex' },
    { value: 'none', label: 'Hidden' },
  ]},
  {
    id: 'flex-direction',
    type: 'Select',
    label: 'Direction',
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
    hiddenWhen: (v) => v.display !== 'flex' && v.display !== 'inline-flex',
    options: [
      { value: 'nowrap', label: 'No Wrap' },
      { value: 'wrap', label: 'Wrap' },
      { value: 'wrap-reverse', label: 'Wrap Reverse' },
    ],
  },
  { id: 'gap', type: 'Text', label: 'Gap', placeholder: 'e.g. 16px, 1rem, 16px 24px' },
  { id: 'width', type: 'Text', label: 'Width', placeholder: 'e.g. 100%, 480px, auto' },
  { id: 'height', type: 'Text', label: 'Height', placeholder: 'e.g. 100vh, 400px, auto' },
  { id: 'max-width', type: 'Text', label: 'Max Width', placeholder: 'e.g. 1100px, 100%' },
  { id: 'min-height', type: 'Text', label: 'Min Height', placeholder: 'e.g. 200px, 50vh' },
];

export const SpacingGroup: PropertyDefinition[] = [
  { id: 'margin', type: 'Spacing', label: 'Margin' },
  { id: 'padding', type: 'Spacing', label: 'Padding' },
];
