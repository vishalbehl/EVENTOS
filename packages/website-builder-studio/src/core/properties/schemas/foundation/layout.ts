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
          { id: 'data-section-name', type: 'Text', label: 'Section Name (Internal)', placeholder: 'e.g. Hero Section' },
          { id: 'id', type: 'Text', label: 'Anchor ID', placeholder: 'e.g. about-us' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-container-width',
            type: 'Select',
            label: 'Container Width',
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
          { id: 'data-fluid', type: 'Toggle', label: 'Fluid Width' },
          { id: 'data-center', type: 'Toggle', label: 'Center Content' },
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
            min: 1,
            max: 12,
            step: 1,
            defaultValue: 2
          },
          { id: 'data-row-gap', type: 'Text', label: 'Row Gap', placeholder: 'e.g. 16px' },
          { id: 'data-col-gap', type: 'Text', label: 'Column Gap', placeholder: 'e.g. 16px' },
          {
            id: 'data-align-items',
            type: 'Select',
            label: 'Align Items',
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
          { id: 'data-collapse-mobile', type: 'Toggle', label: 'Collapse on Mobile', defaultValue: true },
          { id: 'data-cols-tablet', type: 'Number', label: 'Columns on Tablet', min: 1, max: 12 },
          { id: 'data-cols-mobile', type: 'Number', label: 'Columns on Mobile', min: 1, max: 12, defaultValue: 1 },
        ],
      },
    ]
  }
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
          { id: 'data-tabs', type: 'Textarea', label: 'Tab Items (JSON)', placeholder: '[{"title": "Tab 1", "id": "t1"}]' },
        ]
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-tab-style',
            type: 'Select',
            label: 'Tab Style',
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
          { id: 'data-active-color', type: 'Color', label: 'Active State Color' },
          { id: 'data-inactive-color', type: 'Color', label: 'Inactive State Color' },
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
          { id: 'data-items', type: 'Textarea', label: 'Items (JSON)', placeholder: '[{"title": "Q1", "desc": "A1"}]' },
        ]
      },
      {
        groupId: 'LAYOUT',
        properties: [
          { id: 'data-default-open', type: 'Number', label: 'Default Open Item Index (0-based)' },
          { id: 'data-allow-multiple', type: 'Toggle', label: 'Allow Multiple Open' }
        ]
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-chevron',
            type: 'Select',
            label: 'Chevron Style',
            options: [
              { value: 'arrow', label: 'Arrow' },
              { value: 'plus-minus', label: 'Plus / Minus' }
            ]
          },
          {
            id: 'data-border-style',
            type: 'Select',
            label: 'Border Style',
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
