import type { PropertyDefinition } from '../PropertyRegistry';

export const BackgroundGroup: PropertyDefinition[] = [
  {
    id: 'data-bg-type',
    type: 'Select',
    label: 'Background Type',
    target: { kind: 'attribute', name: 'data-bg-type' },
    options: [
      { value: 'none', label: 'None' },
      { value: 'solid', label: 'Solid Color' },
      { value: 'gradient', label: 'Gradient' },
      { value: 'image', label: 'Image' },
    ],
  },
  {
    id: 'background-color',
    type: 'Color',
    label: 'Background Color',
    target: { kind: 'style', css: 'background-color' },
    hiddenWhen: (v) => v['data-bg-type'] === 'none' || v['data-bg-type'] === 'image',
  },
  {
    id: 'background-image',
    type: 'Text',
    label: 'Gradient CSS',
    placeholder: 'e.g. linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    target: { kind: 'style', css: 'background-image' },
    hiddenWhen: (v) => v['data-bg-type'] !== 'gradient',
  },
  {
    id: 'data-bg-image',
    type: 'Asset',
    label: 'Background Image',
    target: { kind: 'style', css: 'background-image' },
    hiddenWhen: (v) => v['data-bg-type'] !== 'image',
  },
  {
    id: 'background-size',
    type: 'Select',
    label: 'Image Size',
    target: { kind: 'style', css: 'background-size' },
    hiddenWhen: (v) => v['data-bg-type'] !== 'image',
    options: [
      { value: 'cover', label: 'Cover' },
      { value: 'contain', label: 'Contain' },
      { value: 'auto', label: 'Auto' },
    ],
  },
  {
    id: 'background-position',
    type: 'Select',
    label: 'Image Position',
    target: { kind: 'style', css: 'background-position' },
    hiddenWhen: (v) => v['data-bg-type'] !== 'image',
    options: [
      { value: 'center center', label: 'Center' },
      { value: 'top center', label: 'Top' },
      { value: 'bottom center', label: 'Bottom' },
    ],
  },
  {
    id: 'data-blur',
    type: 'Toggle',
    label: 'Glassmorphism Blur',
    target: { kind: 'attribute', name: 'data-blur' },
  },
];
