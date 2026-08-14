import type { PropertyDefinition } from '../PropertyRegistry';

export const AnimationGroup: PropertyDefinition[] = [
  {
    id: 'data-aos',
    type: 'Select',
    label: 'Entrance',
    target: { kind: 'attribute', name: 'data-aos' },
    options: [
      { value: 'none', label: 'None' },
      { value: 'fade', label: 'Fade' },
      { value: 'slide', label: 'Slide' },
      { value: 'zoom', label: 'Zoom' },
      { value: 'rotate', label: 'Rotate' },
    ],
  },
  {
    id: 'data-aos-duration',
    type: 'Number',
    label: 'Duration (ms)',
    defaultValue: 400,
    target: { kind: 'attribute', name: 'data-aos-duration' },
    hiddenWhen: (v) => v['data-aos'] === 'none',
  },
  {
    id: 'data-aos-delay',
    type: 'Number',
    label: 'Delay (ms)',
    defaultValue: 0,
    target: { kind: 'attribute', name: 'data-aos-delay' },
    hiddenWhen: (v) => v['data-aos'] === 'none',
  },
  {
    id: 'data-aos-repeat',
    type: 'Toggle',
    label: 'Repeat',
    target: { kind: 'attribute', name: 'data-aos-repeat' },
    hiddenWhen: (v) => v['data-aos'] === 'none',
  },
  {
    id: 'data-scroll-trigger',
    type: 'Toggle',
    label: 'Scroll Trigger',
    target: { kind: 'attribute', name: 'data-scroll-trigger' },
  },
];
