import type { ComponentManifest } from '../../PropertyRegistry';

export const SectionManifest: ComponentManifest = {
  id: 'section',
  title: 'Section',
  icon: 'square',
  category: 'Foundation',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-section-name', type: 'Text', label: 'Section Name (Internal)', placeholder: 'e.g. Hero Section', target: { kind: 'attribute', name: 'data-section-name' } },
          { id: 'id', type: 'Text', label: 'Anchor ID', placeholder: 'e.g. about-us', target: { kind: 'attribute', name: 'id' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-container-width',
            type: 'Select',
            label: 'Container Width',
            target: { kind: 'attribute', name: 'data-container-width' },
            options: [
              { value: 'full', label: 'Full Width (100%)' },
              { value: 'xl', label: 'Extra Large (1280px)' },
              { value: 'lg', label: 'Large (1024px)' },
              { value: 'md', label: 'Medium (768px)' },
              { value: 'sm', label: 'Small (640px)' },
            ],
            defaultValue: 'xl'
          },
          {
            id: 'data-height',
            type: 'Select',
            label: 'Section Height',
            target: { kind: 'attribute', name: 'data-height' },
            options: [
              { value: 'auto', label: 'Auto (Content Based)' },
              { value: 'screen', label: 'Full Screen (100vh)' },
              { value: 'fixed', label: 'Fixed Height' },
            ],
            defaultValue: 'auto'
          },
        ],
      },
      {
        groupId: 'ADVANCED',
        properties: [
          {
            id: 'data-html-tag',
            type: 'Select',
            label: 'HTML Tag',
            target: { kind: 'attribute', name: 'data-html-tag' },
            options: [
              { value: 'section', label: '<section>' },
              { value: 'header', label: '<header>' },
              { value: 'main', label: '<main>' },
              { value: 'article', label: '<article>' },
            ],
            defaultValue: 'section'
          }
        ]
      }
    ]
  }
};

export const ContainerManifest: ComponentManifest = {
  id: 'container',
  title: 'Container',
  icon: 'box',
  category: 'Foundation',
  schema: {
    groups: [
      {
        groupId: 'LAYOUT',
        properties: [
          { id: 'data-fluid', type: 'Toggle', label: 'Fluid Width', target: { kind: 'attribute', name: 'data-fluid' } },
          { id: 'data-center', type: 'Toggle', label: 'Center Content', target: { kind: 'attribute', name: 'data-center' } },
        ],
      },
    ]
  }
};

export const GridManifest: ComponentManifest = {
  id: 'grid',
  title: 'CSS Grid',
  icon: 'grid',
  category: 'Foundation',
  schema: {
    groups: [
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-columns',
            type: 'Number',
            label: 'Columns',
            target: { kind: 'attribute', name: 'data-columns' },
            min: 1,
            max: 12,
            step: 1,
            defaultValue: 2
          },
          { id: 'data-row-gap', type: 'Text', label: 'Row Gap', placeholder: 'e.g. 16px', target: { kind: 'style', css: 'row-gap' } },
          { id: 'data-col-gap', type: 'Text', label: 'Column Gap', placeholder: 'e.g. 16px', target: { kind: 'style', css: 'column-gap' } },
          {
            id: 'data-align-items',
            type: 'Select',
            label: 'Align Items',
            target: { kind: 'style', css: 'align-items' },
            options: [
              { value: 'stretch', label: 'Stretch' },
              { value: 'start', label: 'Start' },
              { value: 'center', label: 'Center' },
              { value: 'end', label: 'End' },
            ],
          },
          {
            id: 'data-justify-items',
            type: 'Select',
            label: 'Justify Items',
            target: { kind: 'style', css: 'justify-items' },
            options: [
              { value: 'stretch', label: 'Stretch' },
              { value: 'start', label: 'Start' },
              { value: 'center', label: 'Center' },
              { value: 'end', label: 'End' },
            ],
          },
        ],
      },
      {
        groupId: 'RESPONSIVE',
        properties: [
          { id: 'data-collapse-mobile', type: 'Toggle', label: 'Collapse on Mobile', defaultValue: true, target: { kind: 'attribute', name: 'data-collapse-mobile' } },
          { id: 'data-cols-tablet', type: 'Number', label: 'Columns on Tablet', min: 1, max: 12, target: { kind: 'attribute', name: 'data-cols-tablet' } },
          { id: 'data-cols-mobile', type: 'Number', label: 'Columns on Mobile', min: 1, max: 12, defaultValue: 1, target: { kind: 'attribute', name: 'data-cols-mobile' } },
        ],
      },
    ]
  }
};

export const CardManifest: ComponentManifest = {
  id: 'card',
  title: 'Card',
  icon: 'square',
  category: 'Foundation',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-card-title', type: 'Text', label: 'Title', target: { kind: 'content', selector: '[data-role="title"]' } },
          { id: 'data-card-description', type: 'Textarea', label: 'Description', target: { kind: 'content', selector: '[data-role="description"]' } },
          { id: 'data-card-link', type: 'Link', label: 'Clickable Card Link', target: { kind: 'attribute', name: 'href', selector: 'a' } },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-card-style',
            type: 'Select',
            label: 'Card Style',
            target: { kind: 'attribute', name: 'data-card-style' },
            options: [
              { value: 'minimal', label: 'Minimal' },
              { value: 'glass', label: 'Glass' },
              { value: 'feature', label: 'Feature' },
              { value: 'pricing', label: 'Pricing' },
            ]
          },
          {
            id: 'data-hover-style',
            type: 'Select',
            label: 'Hover Style',
            target: { kind: 'attribute', name: 'data-hover-style' },
            options: [
              { value: 'none', label: 'None' },
              { value: 'lift', label: 'Lift' },
              { value: 'glow', label: 'Glow' },
              { value: 'scale', label: 'Scale' },
            ]
          },
        ],
      },
    ],
  },
};

export const SpacerManifest: ComponentManifest = {
  id: 'spacer',
  title: 'Spacer',
  icon: 'maximize',
  category: 'Foundation',
  schema: {
    groups: [
      {
        groupId: 'LAYOUT',
        properties: [
          { id: 'height', type: 'Text', label: 'Height Desktop', target: { kind: 'style', css: 'height' }, placeholder: '60px' },
          { id: 'data-height-tablet', type: 'Text', label: 'Height Tablet', placeholder: '40px', target: { kind: 'attribute', name: 'data-height-tablet' } },
          { id: 'data-height-mobile', type: 'Text', label: 'Height Mobile', placeholder: '24px', target: { kind: 'attribute', name: 'data-height-mobile' } },
        ],
      },
    ],
  },
};

export const DividerManifest: ComponentManifest = {
  id: 'divider',
  title: 'Divider',
  icon: 'minus',
  category: 'Foundation',
  schema: {
    groups: [
      {
        groupId: 'STYLE',
        properties: [
          { id: 'border-top-style', type: 'Select', label: 'Divider Style', target: { kind: 'style', css: 'border-top-style' }, options: [
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'dotted', label: 'Dotted' },
            { value: 'double', label: 'Double' },
          ] },
          { id: 'border-top-width', type: 'Text', label: 'Divider Height', target: { kind: 'style', css: 'border-top-width' }, placeholder: '1px' },
          { id: 'border-top-color', type: 'Color', label: 'Divider Color', target: { kind: 'style', css: 'border-top-color' } },
          { id: 'width', type: 'Text', label: 'Divider Width', target: { kind: 'style', css: 'width' }, placeholder: '100%' },
        ],
      },
    ],
  },
};

export const TabsManifest: ComponentManifest = {
  id: 'tabs',
  title: 'Tabs',
  icon: 'folder',
  category: 'Foundation',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-tabs', type: 'Textarea', label: 'Tab Items (JSON)', placeholder: '[{"title": "Tab 1", "id": "t1"}]', target: { kind: 'attribute', name: 'data-tabs' } },
        ]
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-tab-style',
            type: 'Select',
            label: 'Tab Style',
            target: { kind: 'attribute', name: 'data-tab-style' },
            options: [
              { value: 'underline', label: 'Underline' },
              { value: 'buttons', label: 'Buttons' },
              { value: 'cards', label: 'Cards' },
              { value: 'pills', label: 'Pills' },
            ],
            defaultValue: 'underline'
          },
          {
            id: 'data-tab-align',
            type: 'Select',
            label: 'Alignment',
            target: { kind: 'attribute', name: 'data-tab-align' },
            options: [
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
            ],
            defaultValue: 'left'
          }
        ]
      },
      {
        groupId: 'STYLE',
        properties: [
          { id: 'data-active-color', type: 'Color', label: 'Active State Color', target: { kind: 'attribute', name: 'data-active-color' } },
          { id: 'data-inactive-color', type: 'Color', label: 'Inactive State Color', target: { kind: 'attribute', name: 'data-inactive-color' } },
        ]
      }
    ]
  }
};

export const AccordionManifest: ComponentManifest = {
  id: 'accordion',
  title: 'Accordion',
  icon: 'list',
  category: 'Foundation',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-items', type: 'Textarea', label: 'Items (JSON)', placeholder: '[{"title": "Q1", "desc": "A1"}]', target: { kind: 'attribute', name: 'data-items' } },
        ]
      },
      {
        groupId: 'LAYOUT',
        properties: [
          { id: 'data-default-open', type: 'Number', label: 'Default Open Item Index (0-based)', target: { kind: 'attribute', name: 'data-default-open' } },
          { id: 'data-allow-multiple', type: 'Toggle', label: 'Allow Multiple Open', target: { kind: 'attribute', name: 'data-allow-multiple' } }
        ]
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-chevron',
            type: 'Select',
            label: 'Chevron Style',
            target: { kind: 'attribute', name: 'data-chevron' },
            options: [
              { value: 'arrow', label: 'Arrow' },
              { value: 'plus-minus', label: 'Plus / Minus' }
            ]
          },
          {
            id: 'data-border-style',
            type: 'Select',
            label: 'Border Style',
            target: { kind: 'attribute', name: 'data-border-style' },
            options: [
              { value: 'separated', label: 'Separated Cards' },
              { value: 'continuous', label: 'Continuous Lines' }
            ]
          }
        ]
      }
    ]
  }
};
