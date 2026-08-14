import type { ComponentManifest } from '../../PropertyRegistry';

export const ButtonManifest: ComponentManifest = {
  id: 'button',
  title: 'Button',
  icon: 'square',
  category: 'Forms',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-label', type: 'Text', label: 'Label', placeholder: 'Click Here', target: { kind: 'content', selector: ':self' } },
          { id: 'data-link', type: 'Link', label: 'Link URL', target: { kind: 'attribute', name: 'href' } },
          { id: 'data-left-icon', type: 'Text', label: 'Left Icon (Lucide)', target: { kind: 'attribute', name: 'data-left-icon' } },
          { id: 'data-right-icon', type: 'Text', label: 'Right Icon (Lucide)', target: { kind: 'attribute', name: 'data-right-icon' } },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-variant',
            type: 'Select',
            label: 'Variant',
            target: { kind: 'attribute', name: 'data-variant' },
            options: [
              { value: 'primary', label: 'Primary' },
              { value: 'secondary', label: 'Secondary' },
              { value: 'outline', label: 'Outline' },
              { value: 'ghost', label: 'Ghost' },
            ],
            defaultValue: 'primary'
          },
          {
            id: 'data-size',
            type: 'Select',
            label: 'Size',
            target: { kind: 'attribute', name: 'data-size' },
            options: [
              { value: 'sm', label: 'Small' },
              { value: 'md', label: 'Medium' },
              { value: 'lg', label: 'Large' },
            ],
            defaultValue: 'md'
          },
        ],
      },
      {
        groupId: 'EFFECTS',
        properties: [
          {
            id: 'data-hover-anim',
            type: 'Select',
            label: 'Hover Animation',
            target: { kind: 'attribute', name: 'data-hover-anim' },
            options: [
              { value: 'none', label: 'None' },
              { value: 'pulse', label: 'Pulse' },
              { value: 'lift', label: 'Lift' },
              { value: 'glow', label: 'Glow' },
            ],
          },
        ],
      },
    ]
  }
};

export const ButtonGroupManifest: ComponentManifest = {
  id: 'button-group',
  title: 'Button Group',
  icon: 'layers',
  category: 'Forms',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-buttons', type: 'Textarea', label: 'Buttons (JSON Array)', placeholder: '[{"label":"Btn 1","link":"#"},{"label":"Btn 2","link":"#"}]', target: { kind: 'attribute', name: 'data-buttons' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-orientation',
            type: 'Select',
            label: 'Orientation',
            target: { kind: 'attribute', name: 'data-orientation' },
            options: [
              { value: 'horizontal', label: 'Horizontal' },
              { value: 'vertical', label: 'Vertical' },
            ],
            defaultValue: 'horizontal'
          },
          { id: 'data-spacing', type: 'Text', label: 'Spacing', placeholder: 'e.g. 16px', target: { kind: 'attribute', name: 'data-spacing' } },
        ],
      },
    ]
  }
};
