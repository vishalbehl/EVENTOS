import type { ComponentManifest, PropertyDefinition, PropertyTarget } from '../PropertyRegistry';
import { SOCIAL_ICON_OPTIONS } from '../../iconLibrary';

const SOCIAL_ICON_OPTIONS_FOR_SCHEMA = SOCIAL_ICON_OPTIONS.map(option => option.platform);

const text = (id: string, label: string, selector = ':self'): PropertyDefinition => ({
  id,
  type: 'Text',
  label,
  target: { kind: 'content', selector },
});

const attr = (id: string, label: string, name: string, selector?: string, type = 'Text'): PropertyDefinition => ({
  id,
  type,
  label,
  target: { kind: 'attribute', name, selector },
});

const select = (id: string, label: string, values: string[], target?: PropertyTarget): PropertyDefinition => ({
  id,
  type: 'Select',
  label,
  target: target || { kind: 'attribute', name: id },
  options: values.map(value => ({ value, label: value.replace(/-/g, ' ') })),
});

function manifest(id: string, title: string, category: string, properties: PropertyDefinition[], supportsData = false): ComponentManifest {
  return {
    id,
    title,
    category,
    supportsData,
    dataBinding: supportsData ? { fields: ['eventName', 'speakers', 'sessions', 'sponsors', 'venue', 'stats'], fallback: 'mock' } : undefined,
    schema: {
      groups: [
        { groupId: 'CONTENT', properties },
      ],
    },
  };
}

export const ComponentLibraryManifests: ComponentManifest[] = [
  manifest('subheading', 'Subheading', 'Typography', [
    text('data-text', 'Text'),
    attr('data-icon', 'Icon', 'data-icon'),
    attr('data-divider', 'Divider', 'data-divider', undefined, 'Toggle'),
  ]),
  manifest('lead-text', 'Lead Text', 'Typography', [
    text('data-text', 'Lead Text'),
    attr('data-highlight', 'Highlight', 'data-highlight'),
    { id: 'max-width', type: 'Text', label: 'Max Width', target: { kind: 'style', css: 'max-width' } },
  ]),
  manifest('highlight', 'Highlight', 'Typography', [
    text('data-text', 'Highlight Text'),
    select('data-highlight-style', 'Highlight Style', ['mark', 'pill', 'underline', 'icon']),
    { id: 'background-color', type: 'Color', label: 'Highlight Color', target: { kind: 'style', css: 'background-color', selector: 'mark' } },
  ]),
  manifest('counter', 'Counter', 'Typography', [
    attr('data-start', 'Start Number', 'data-start'),
    attr('data-end', 'End Number', 'data-end'),
    attr('data-prefix', 'Prefix', 'data-prefix'),
    attr('data-suffix', 'Suffix', 'data-suffix'),
    attr('data-duration', 'Duration', 'data-duration'),
  ]),
  manifest('marquee', 'Marquee', 'Typography', [
    select('data-direction', 'Direction', ['left', 'right']),
    attr('data-speed', 'Speed', 'data-speed'),
    attr('data-pause-hover', 'Pause on Hover', 'data-pause-hover', undefined, 'Toggle'),
    attr('data-gap', 'Gap', 'data-gap'),
  ]),
  manifest('image-text', 'Image + Text', 'Media', [
    text('data-title', 'Title', 'h1,h2,h3'),
    text('data-description', 'Description', 'p'),
    attr('data-image', 'Image', 'src', 'img', 'Asset'),
    attr('data-link', 'Button Link', 'href', 'a', 'Link'),
    select('data-layout', 'Layout', ['image-left', 'image-right', 'stacked']),
  ]),
  manifest('logo-marquee', 'Logo Marquee', 'Media', [
    attr('data-logos', 'Logos', 'data-logos', undefined, 'Textarea'),
    attr('data-speed', 'Speed', 'data-speed'),
    select('data-direction', 'Direction', ['left', 'right']),
    attr('data-grayscale', 'Grayscale', 'data-grayscale', undefined, 'Toggle'),
  ]),
  manifest('icon-block', 'Icon Block', 'Media', [
    attr('data-icon', 'Icon', 'data-icon'),
    text('data-title', 'Title', 'h1,h2,h3'),
    text('data-description', 'Description', 'p'),
    select('data-icon-shape', 'Icon Shape', ['square', 'circle', 'soft']),
  ]),
  manifest('sponsor-inquiry', 'Sponsor Inquiry', 'Forms', [
    attr('data-fields', 'Fields', 'data-fields', undefined, 'Textarea'),
    attr('data-package-dropdown', 'Package Dropdown', 'data-package-dropdown', undefined, 'Toggle'),
    attr('data-email', 'Recipient Email', 'data-email'),
    attr('data-success-page', 'Success Page', 'data-success-page', undefined, 'Link'),
  ]),
  manifest('breadcrumb', 'Breadcrumb', 'Navigation', [
    attr('data-separator', 'Separator', 'data-separator'),
    attr('data-show-home', 'Show Home', 'data-show-home', undefined, 'Toggle'),
    attr('data-dynamic', 'Dynamic', 'data-dynamic', undefined, 'Toggle'),
  ]),
  manifest('progress-bar', 'Progress Bar', 'Navigation', [
    attr('data-value', 'Value', 'data-value'),
    attr('data-max', 'Max', 'data-max'),
    text('data-label', 'Label'),
    attr('data-animated', 'Animated', 'data-animated', undefined, 'Toggle'),
  ]),
  manifest('map', 'Map', 'Utilities', [
    attr('data-address', 'Address', 'data-address'),
    attr('data-latitude', 'Latitude', 'data-latitude'),
    attr('data-longitude', 'Longitude', 'data-longitude'),
    attr('data-zoom', 'Zoom', 'data-zoom'),
    select('data-map-type', 'Map Type', ['roadmap', 'satellite', 'hybrid']),
  ]),
  manifest('qr-code', 'QR Code', 'Utilities', [
    attr('data-qr-data', 'Data', 'data-qr-data'),
    attr('data-logo', 'Logo', 'data-logo', undefined, 'Asset'),
    attr('data-size', 'Size', 'data-size'),
    attr('data-download', 'Download', 'data-download', undefined, 'Toggle'),
  ]),
  manifest('social-icons', 'Social Icons', 'Utilities', [
    attr('data-platforms', 'Social Handles', 'data-platforms', undefined, 'SocialLinks'),
    select('data-icon-style', 'Icon Style', ['plain', 'filled', 'outline']),
    select('data-shape', 'Shape', ['circle', 'square', 'soft']),
    { id: 'gap', type: 'Text', label: 'Gap', target: { kind: 'style', css: 'gap' } },
    { id: 'color', type: 'Color', label: 'Icon Color', target: { kind: 'style', css: 'color' } },
  ]),
  manifest('social-icon', 'Social Icon', 'Utilities', [
    select('data-platform', 'Icon', SOCIAL_ICON_OPTIONS_FOR_SCHEMA),
    attr('href', 'Link', 'href', undefined, 'Link'),
    attr('aria-label', 'Label', 'aria-label'),
    { id: 'color', type: 'Color', label: 'Icon Color', target: { kind: 'style', css: 'color' } },
    { id: 'background', type: 'Color', label: 'Background', target: { kind: 'style', css: 'background' } },
  ]),
  manifest('badge', 'Badge', 'Utilities', [
    text('data-badge-text', 'Badge Text'),
    { id: 'background-color', type: 'Color', label: 'Badge Color', target: { kind: 'style', css: 'background-color' } },
    attr('data-icon', 'Icon', 'data-icon'),
  ]),
  manifest('alert', 'Alert', 'Utilities', [
    select('data-type', 'Type', ['info', 'success', 'warning', 'danger']),
    text('data-message', 'Message'),
    attr('data-icon', 'Icon', 'data-icon'),
    attr('data-dismissible', 'Dismissible', 'data-dismissible', undefined, 'Toggle'),
  ]),
  manifest('featured-speaker', 'Featured Speaker', 'Event', [
    attr('data-speaker', 'Speaker', 'data-speaker'),
    select('data-layout', 'Layout', ['split', 'card', 'spotlight']),
    attr('data-show-bio', 'Show Bio', 'data-show-bio', undefined, 'Toggle'),
    attr('data-show-session', 'Show Session', 'data-show-session', undefined, 'Toggle'),
  ], true),
  manifest('event-overview', 'Event Overview', 'Event', [
    attr('data-import-overview', 'Import Overview', 'data-import-overview', undefined, 'Toggle'),
    text('data-title', 'Title', 'h1,h2,h3'),
    text('data-description', 'Description', 'p'),
    attr('data-objectives', 'Objectives', 'data-objectives', undefined, 'Textarea'),
  ], true),
  manifest('organizer-message', 'Organizer Message', 'Event', [
    attr('data-import-organizer', 'Import Organizer', 'data-import-organizer', undefined, 'Toggle'),
    attr('data-photo', 'Photo', 'src', 'img', 'Asset'),
    text('data-name', 'Name', '[data-role="name"]'),
    text('data-message', 'Message', '[data-role="message"]'),
  ], true),
  manifest('registration-cta', 'Registration CTA', 'Event', [
    text('data-title', 'Title', 'h1,h2,h3'),
    text('data-description', 'Description', 'p'),
    attr('data-registration-url', 'Registration URL', 'href', 'a', 'Link'),
    attr('data-deadline', 'Deadline', 'data-deadline'),
    attr('data-price', 'Price', 'data-price'),
  ], true),
  manifest('contact-footer', 'Contact / Footer', 'Event', [
    attr('data-email', 'Email', 'data-email'),
    attr('data-phone', 'Phone', 'data-phone'),
    attr('data-whatsapp', 'WhatsApp', 'data-whatsapp'),
    attr('data-social-links', 'Social Links', 'data-social-links', undefined, 'Textarea'),
  ], true),
];
