/**
 * PropertyRegistry.ts
 * 
 * Central registry for all reusable properties (Traits) in the Website Builder Studio.
 * This ensures consistency across the 55+ components and maps directly to the 10-tab Property System.
 * 
 * Note: Styles (Appearance, Layout, Spacing, Typography, Effects) are handled by the GrapesJS Style Manager.
 * The traits below are for Content, Animation, Responsive, Visibility, and Advanced tabs.
 */

// We prefix traits with the tab name they belong to so we can filter them in the custom Inspector UI.
// E.g., `content:source`, `animation:aos`

export const AnimationProperties = [
  {
    type: 'select',
    name: 'animation:data-aos',
    label: 'Entrance Animation',
    options: [
      { id: '', name: 'None' },
      { id: 'fade-up', name: 'Fade Up' },
      { id: 'fade-down', name: 'Fade Down' },
      { id: 'fade-right', name: 'Fade Right' },
      { id: 'fade-left', name: 'Fade Left' },
      { id: 'zoom-in', name: 'Zoom In' },
      { id: 'zoom-out', name: 'Zoom Out' },
      { id: 'slide-up', name: 'Slide Up' },
      { id: 'flip-up', name: 'Flip Up' },
    ],
  },
  {
    type: 'number',
    name: 'animation:data-aos-delay',
    label: 'Delay (ms)',
    min: 0,
    max: 3000,
    step: 50,
  },
  {
    type: 'number',
    name: 'animation:data-aos-duration',
    label: 'Duration (ms)',
    min: 0,
    max: 3000,
    step: 50,
  },
];

export const ResponsiveProperties = [
  {
    type: 'select',
    name: 'responsive:order-desktop',
    label: 'Desktop Order',
    options: [
      { id: '', name: 'Default' },
      { id: '1', name: 'First' },
      { id: '99', name: 'Last' },
    ],
  },
  {
    type: 'select',
    name: 'responsive:order-mobile',
    label: 'Mobile Order',
    options: [
      { id: '', name: 'Default' },
      { id: '1', name: 'First' },
      { id: '99', name: 'Last' },
    ],
  },
];

export const VisibilityProperties = [
  {
    type: 'checkbox',
    name: 'visibility:hide-desktop',
    label: 'Hide on Desktop',
  },
  {
    type: 'checkbox',
    name: 'visibility:hide-tablet',
    label: 'Hide on Tablet',
  },
  {
    type: 'checkbox',
    name: 'visibility:hide-mobile',
    label: 'Hide on Mobile',
  },
  {
    type: 'select',
    name: 'visibility:publish-status',
    label: 'Publish Status',
    options: [
      { id: 'all', name: 'Visible Everywhere' },
      { id: 'draft', name: 'Draft Only (Hidden on Live)' },
    ],
  },
];

export const AdvancedProperties = [
  {
    type: 'text',
    name: 'id', // Keep 'id' standard for HTML id
    label: 'HTML ID',
    placeholder: 'e.g. my-section',
  },
  {
    type: 'text',
    name: 'title', // Standard HTML title
    label: 'Tooltip / Title',
  },
  {
    type: 'text',
    name: 'advanced:aria-label',
    label: 'ARIA Label',
  },
  {
    type: 'text',
    name: 'advanced:data-custom',
    label: 'Custom Data Attribute',
  },
];
