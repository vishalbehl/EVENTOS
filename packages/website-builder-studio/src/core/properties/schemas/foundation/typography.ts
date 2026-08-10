import type { ComponentManifest } from '../../PropertyRegistry';

export const HeadingManifest: ComponentManifest = {
  id: 'heading',
  title: 'Heading',
  icon: 'type',
  category: 'Typography',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-content', type: 'Textarea', label: 'Text Content', placeholder: 'Enter heading text' },
          { id: 'data-variable', type: 'Select', label: 'Dynamic Variable', options: [
            { value: '', label: 'None' },
            { value: '{{event.name}}', label: 'Event Name' },
            { value: '{{event.date}}', label: 'Event Date' },
            { value: '{{event.location}}', label: 'Event Location' },
          ]},
          { id: 'data-highlight', type: 'Text', label: 'Highlight Words (comma separated)' },
        ],
      },
      {
        groupId: 'TYPOGRAPHY',
        properties: [
          {
            id: 'data-tag',
            type: 'Select',
            label: 'HTML Tag',
            options: [
              { value: 'h1', label: 'H1' },
              { value: 'h2', label: 'H2' },
              { value: 'h3', label: 'H3' },
              { value: 'h4', label: 'H4' },
              { value: 'h5', label: 'H5' },
              { value: 'h6', label: 'H6' },
            ],
            defaultValue: 'h2'
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          { id: 'data-stroke', type: 'Text', label: 'Text Stroke', placeholder: 'e.g. 1px black' },
          { id: 'data-gradient', type: 'Toggle', label: 'Gradient Text' },
        ],
      },
    ]
  }
};

export const ParagraphManifest: ComponentManifest = {
  id: 'paragraph',
  title: 'Paragraph',
  icon: 'type',
  category: 'Typography',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-content', type: 'Textarea', label: 'Text Content', placeholder: 'Enter paragraph text' },
          { id: 'data-enable-links', type: 'Toggle', label: 'Enable Links' },
        ],
      },
      {
        groupId: 'TYPOGRAPHY',
        properties: [
          { id: 'data-columns', type: 'Select', label: 'Columns', options: [
            { value: '1', label: '1 Column' },
            { value: '2', label: '2 Columns' },
            { value: '3', label: '3 Columns' },
          ], defaultValue: '1' },
        ],
      },
    ]
  }
};

export const BlockquoteManifest: ComponentManifest = {
  id: 'blockquote',
  title: 'Blockquote',
  icon: 'quote',
  category: 'Typography',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-quote', type: 'Textarea', label: 'Quote Text' },
          { id: 'data-author', type: 'Text', label: 'Author Name' },
          { id: 'data-title', type: 'Text', label: 'Author Title' },
          { id: 'data-avatar', type: 'Asset', label: 'Avatar Image' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-icon-placement',
            type: 'Select',
            label: 'Quote Icon Placement',
            options: [
              { value: 'top-left', label: 'Top Left' },
              { value: 'top-right', label: 'Top Right' },
              { value: 'inline', label: 'Inline' },
              { value: 'hidden', label: 'Hidden' },
            ],
          },
        ],
      },
    ]
  }
};
