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
          { id: 'data-label', type: 'Text', label: 'Label', placeholder: 'Click Here' },
          { id: 'data-link', type: 'Text', label: 'Link URL', placeholder: 'https://...' },
          { id: 'data-left-icon', type: 'Text', label: 'Left Icon (Lucide)' },
          { id: 'data-right-icon', type: 'Text', label: 'Right Icon (Lucide)' },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-variant',
            type: 'Select',
            label: 'Variant',
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
          { id: 'data-buttons', type: 'Textarea', label: 'Buttons (JSON Array)', placeholder: '[{"label":"Btn 1","link":"#"},{"label":"Btn 2","link":"#"}]' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-orientation',
            type: 'Select',
            label: 'Orientation',
            options: [
              { value: 'horizontal', label: 'Horizontal' },
              { value: 'vertical', label: 'Vertical' },
            ],
            defaultValue: 'horizontal'
          },
          { id: 'data-spacing', type: 'Text', label: 'Spacing', placeholder: 'e.g. 16px' },
        ],
      },
    ]
  }
};
