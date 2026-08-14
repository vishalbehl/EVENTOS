import type { ComponentManifest } from '../../PropertyRegistry';

export const HeaderManifest: ComponentManifest = {
  id: 'header',
  title: 'Header',
  icon: 'panel-top',
  category: 'Headers',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-logo', type: 'Asset', label: 'Logo Image', target: { kind: 'attribute', name: 'src', selector: '[data-role="logo-image"]' } },
          { id: 'data-logo-text', type: 'Text', label: 'Logo Text', target: { kind: 'content', selector: '[data-role="logo-text"]' } },
          { id: 'data-links', type: 'Textarea', label: 'Menu Links JSON', target: { kind: 'attribute', name: 'data-links' } },
          { id: 'data-cta-text', type: 'Text', label: 'CTA Text', target: { kind: 'content', selector: '[data-role="cta"]' } },
          { id: 'data-cta-link', type: 'Link', label: 'CTA Link', target: { kind: 'attribute', name: 'href', selector: '[data-role="cta"]' } },
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
            target: { kind: 'attribute', name: 'data-position' },
            defaultValue: 'static',
          },
          { id: 'height', type: 'Text', label: 'Header Height', target: { kind: 'style', css: 'min-height' } },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          { id: 'background', type: 'Color', label: 'Background', target: { kind: 'style', css: 'background' } },
          { id: 'color', type: 'Color', label: 'Text Color', target: { kind: 'style', css: 'color' } },
          { id: 'border-color', type: 'Color', label: 'Border Color', target: { kind: 'style', css: 'border-color' } },
          { id: 'box-shadow', type: 'Text', label: 'Shadow', target: { kind: 'style', css: 'box-shadow' } },
        ],
      },
    ],
  },
};

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
          { id: 'data-logo', type: 'Asset', label: 'Logo Asset', target: { kind: 'attribute', name: 'src', selector: '[data-role="logo-image"],img' } },
          { id: 'data-logo-text', type: 'Text', label: 'Logo Text', target: { kind: 'content', selector: '[data-role="logo"],[data-gjs-type="heading"]' } },
          { id: 'data-links', type: 'Textarea', label: 'Navigation Links (JSON)', target: { kind: 'attribute', name: 'data-links' } },
          { id: 'data-cta-text', type: 'Text', label: 'CTA Button Text', target: { kind: 'content', selector: '[data-role="cta"],a:last-child' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-position',
            type: 'Select',
            label: 'Position',
            target: { kind: 'attribute', name: 'data-position' },
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
          { id: 'data-transparent-top', type: 'Toggle', label: 'Transparent on Top', defaultValue: true, target: { kind: 'attribute', name: 'data-transparent-top' } },
          { id: 'data-glassmorphism', type: 'Toggle', label: 'Glassmorphism Effect', defaultValue: true, target: { kind: 'attribute', name: 'data-glassmorphism' } },
          {
            id: 'data-menu-style',
            type: 'Select',
            label: 'Menu Style',
            target: { kind: 'attribute', name: 'data-menu-style' },
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
          { id: 'data-copyright', type: 'Text', label: 'Copyright Text', target: { kind: 'content', selector: '[data-role="copyright"],p:last-child' } },
          { id: 'data-logo', type: 'Asset', label: 'Logo Asset', target: { kind: 'attribute', name: 'src', selector: '[data-role="logo-image"],img' } },
          { id: 'data-logo-text', type: 'Text', label: 'Logo Text', target: { kind: 'content', selector: '[data-role="footer-brand"],[data-gjs-type="heading"]' } },
          { id: 'data-socials', type: 'Textarea', label: 'Social Links (JSON)', target: { kind: 'attribute', name: 'data-socials' } },
          { id: 'data-columns', type: 'Textarea', label: 'Columns Content (JSON)', target: { kind: 'attribute', name: 'data-columns' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout-cols',
            type: 'Select',
            label: 'Columns',
            target: { kind: 'attribute', name: 'data-layout-cols' },
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
