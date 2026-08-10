import type { ComponentManifest } from '../../PropertyRegistry';

export const NavbarManifest: ComponentManifest = {
  id: 'navigation',
  title: 'Navbar',
  icon: 'navigation',
  category: 'Navigation',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-logo', type: 'Asset', label: 'Logo Asset' },
          { id: 'data-links', type: 'Textarea', label: 'Navigation Links (JSON)' },
          { id: 'data-cta-text', type: 'Text', label: 'CTA Button Text' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-position',
            type: 'Select',
            label: 'Position',
            options: [
              { value: 'static', label: 'Static' },
              { value: 'sticky', label: 'Sticky' },
              { value: 'fixed', label: 'Fixed' },
            ],
            defaultValue: 'sticky'
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          { id: 'data-transparent-top', type: 'Toggle', label: 'Transparent on Top', defaultValue: true },
          { id: 'data-glassmorphism', type: 'Toggle', label: 'Glassmorphism Effect', defaultValue: true },
          {
            id: 'data-menu-style',
            type: 'Select',
            label: 'Menu Style',
            options: [
              { value: 'inline', label: 'Inline (Desktop)' },
              { value: 'hamburger', label: 'Hamburger (Always)' },
            ],
            defaultValue: 'inline'
          },
        ],
      },
    ]
  }
};

export const FooterManifest: ComponentManifest = {
  id: 'footer',
  title: 'Footer',
  icon: 'layout',
  category: 'Navigation',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-copyright', type: 'Text', label: 'Copyright Text' },
          { id: 'data-logo', type: 'Asset', label: 'Logo Asset' },
          { id: 'data-socials', type: 'Textarea', label: 'Social Links (JSON)' },
          { id: 'data-columns', type: 'Textarea', label: 'Columns Content (JSON)' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout-cols',
            type: 'Select',
            label: 'Columns',
            options: [
              { value: '2', label: '2 Columns' },
              { value: '3', label: '3 Columns' },
              { value: '4', label: '4 Columns' },
              { value: '5', label: '5 Columns' },
            ],
            defaultValue: '4'
          },
        ],
      },
    ]
  }
};
