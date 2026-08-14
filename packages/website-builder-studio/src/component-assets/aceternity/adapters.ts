import type { ComponentManifest, PropertyDefinition } from '../../core/properties/PropertyRegistry';
import type { WebsiteComponentAsset } from '../types';
import { ACETERNITY_CATALOG } from './catalog.generated';
import {
  ACETERNITY_STATIC_ASSETS,
  ACETERNITY_STATIC_COMPONENT_NAMES,
  ACETERNITY_STATIC_MANIFESTS,
  getAceternityStaticAsset,
} from './staticAdapters';
import {
  ACETERNITY_INTERACTIVE_ASSETS,
  ACETERNITY_INTERACTIVE_COMPONENT_NAMES,
  ACETERNITY_INTERACTIVE_MANIFESTS,
  getAceternityInteractiveAsset,
} from './interactiveAdapters';
import {
  ACETERNITY_EXTENDED_ASSETS,
  ACETERNITY_EXTENDED_COMPONENT_NAMES,
  ACETERNITY_EXTENDED_MANIFESTS,
  getAceternityExtendedAsset,
} from './extendedAdapters';

export const ACETERNITY_BUILDER_COMPONENT_NAMES = [
  'aurora-background',
  'spotlight',
  'background-gradient',
  'hover-border-gradient',
  'moving-border',
  'bento-grid',
  'text-generate-effect',
  'typewriter-effect',
  'infinite-moving-cards',
  'grid',
  'sparkles',
  'meteors',
  ...ACETERNITY_STATIC_COMPONENT_NAMES,
  ...ACETERNITY_INTERACTIVE_COMPONENT_NAMES,
  ...ACETERNITY_EXTENDED_COMPONENT_NAMES,
] as const;

export const ACETERNITY_FIDELITY_REVIEWED_COMPONENT_NAMES = [
  'aurora-background',
  'spotlight',
  'background-gradient',
  'bento-grid',
  'grid',
] as const;

export type AceternityBuilderComponentName = (typeof ACETERNITY_BUILDER_COMPONENT_NAMES)[number];

const typeFor = (name: string) => `aceternity-${name}`;

function asAsset(name: AceternityBuilderComponentName, title: string, description: string, html: string, tags: string[]): WebsiteComponentAsset {
  return {
    id: typeFor(name),
    name: title,
    kind: 'component',
    group: 'Aceternity',
    description,
    tags: ['aceternity', ...tags],
    preview: { accent: '#8b5cf6', background: '#070812', title, subtitle: 'Editable component' },
    html,
    json: { components: [] },
  };
}

const sectionBase = 'position:relative;width:100%;min-height:520px;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:80px 32px;background-color:#06070d;color:#f8fafc;box-sizing:border-box;';
const contentBase = 'position:relative;z-index:2;width:100%;max-width:980px;margin:0 auto;text-align:center;';
const headingBase = 'margin:0 0 18px;font-size:clamp(40px,6vw,76px);line-height:1.04;font-weight:900;letter-spacing:0;color:#f8fafc;';
const paragraphBase = 'max-width:700px;margin:0 auto;color:#aeb7c8;font-size:18px;line-height:1.65;';

export const ACETERNITY_BUILDER_ASSETS: WebsiteComponentAsset[] = [
  asAsset('aurora-background', 'Aurora Background', 'Animated aurora hero background with editable heading and supporting copy.', `
<section data-gjs-type="aceternity-aurora-background" data-aceternity-name="aurora-background" class="wb-ac-component wb-ac-aurora" style="${sectionBase}">
  <div class="wb-ac-aurora-clip" aria-hidden="true"><div class="wb-ac-aurora-layer"></div></div>
  <div class="wb-ac-content" style="${contentBase}">
    <h2 data-gjs-type="heading" style="${headingBase}">Ideas deserve a remarkable stage</h2>
    <p data-gjs-type="paragraph" style="${paragraphBase}">Build an event experience that feels alive before the doors even open.</p>
  </div>
</section>`.trim(), ['background', 'hero', 'animation']),

  asAsset('spotlight', 'Spotlight', 'Focused radial spotlight section for event announcements and hero statements.', `
<section data-gjs-type="aceternity-spotlight" data-aceternity-name="spotlight" class="wb-ac-component wb-ac-spotlight" style="${sectionBase}">
  <svg class="wb-ac-spotlight-beam" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3787 2842" fill="none"><g filter="url(#wb-aceternity-spotlight-filter)"><ellipse cx="1924.71" cy="273.501" rx="1924.71" ry="273.501" transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)" fill="currentColor" fill-opacity="0.21"></ellipse></g><defs><filter id="wb-aceternity-spotlight-filter" x="0.860352" y="0.838989" width="3785.16" height="2840.26" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur stdDeviation="151" result="effect1_foregroundBlur_1065_8"></feGaussianBlur></filter></defs></svg>
  <div class="wb-ac-content" style="${contentBase}">
    <p data-gjs-type="subheading" style="margin:0 0 14px;color:#a78bfa;font-size:13px;font-weight:800;text-transform:uppercase;">Main stage</p>
    <h2 data-gjs-type="heading" style="${headingBase}">One room. The conversations that matter.</h2>
    <p data-gjs-type="paragraph" style="${paragraphBase}">Use the spotlight to draw attention to a keynote, launch, or important event moment.</p>
  </div>
</section>`.trim(), ['background', 'hero', 'spotlight']),

  asAsset('background-gradient', 'Background Gradient Card', 'Premium animated gradient card with independently editable content.', `
<article data-gjs-type="aceternity-background-gradient" data-aceternity-name="background-gradient" class="wb-ac-component wb-ac-gradient-card" style="position:relative;max-width:760px;margin:40px auto;padding:4px;border-radius:24px;box-sizing:border-box;">
  <div class="wb-ac-gradient-blur" aria-hidden="true"></div><div class="wb-ac-gradient-edge" aria-hidden="true"></div>
  <div class="wb-ac-gradient-surface" style="position:relative;z-index:1;padding:42px;border-radius:20px;background-color:#0b0d16;color:#f8fafc;">
    <p data-gjs-type="subheading" style="margin:0 0 10px;color:#a78bfa;font-size:12px;font-weight:800;text-transform:uppercase;">Featured experience</p>
    <h3 data-gjs-type="heading" style="margin:0 0 12px;font-size:34px;line-height:1.15;color:#f8fafc;">Designed for the moments people remember</h3>
    <p data-gjs-type="paragraph" style="margin:0;color:#aeb7c8;font-size:16px;line-height:1.65;">A focused content card with a living gradient edge and production-safe motion.</p>
  </div>
</article>`.trim(), ['card', 'gradient', 'animation']),

  asAsset('bento-grid', 'Bento Grid', 'Responsive event feature grid with independently selectable cards and text.', `
<section data-gjs-type="aceternity-bento-grid" data-aceternity-name="bento-grid" class="wb-ac-component wb-ac-bento" style="width:100%;padding:72px 32px;background-color:#070812;color:#f8fafc;box-sizing:border-box;">
  <div style="max-width:1120px;margin:0 auto;">
    <h2 data-gjs-type="heading" style="margin:0 0 28px;font-size:42px;line-height:1.12;color:#f8fafc;">Everything your audience needs</h2>
    <div class="wb-ac-bento-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;">
      <article data-gjs-type="card" class="wb-ac-bento-item wb-ac-bento-item--wide"><span class="wb-ac-bento-kicker">01</span><h3 data-gjs-type="heading">Live agenda</h3><p data-gjs-type="paragraph">Keep sessions, rooms, and schedule changes current.</p></article>
      <article data-gjs-type="card" class="wb-ac-bento-item"><span class="wb-ac-bento-kicker">02</span><h3 data-gjs-type="heading">Speakers</h3><p data-gjs-type="paragraph">Put expertise, profiles, and sessions in context.</p></article>
      <article data-gjs-type="card" class="wb-ac-bento-item"><span class="wb-ac-bento-kicker">03</span><h3 data-gjs-type="heading">Venue</h3><p data-gjs-type="paragraph">Make arrival and navigation straightforward.</p></article>
      <article data-gjs-type="card" class="wb-ac-bento-item wb-ac-bento-item--wide"><span class="wb-ac-bento-kicker">04</span><h3 data-gjs-type="heading">Registration</h3><p data-gjs-type="paragraph">Connect visitors to the right registration journey.</p></article>
    </div>
  </div>
</section>`.trim(), ['layout', 'cards', 'features']),

  asAsset('infinite-moving-cards', 'Infinite Moving Cards', 'Continuous testimonial and announcement rail with selectable cards.', `
<section data-gjs-type="aceternity-infinite-moving-cards" data-aceternity-name="infinite-moving-cards" data-speed="28" data-direction="left" class="wb-ac-component wb-ac-infinite-cards" style="width:100%;overflow:hidden;padding:56px 0;background-color:#070812;color:#f8fafc;box-sizing:border-box;">
  <div data-role="marquee-track" class="wb-ac-infinite-track">
    <article data-gjs-type="card" class="wb-ac-quote-card"><p data-gjs-type="paragraph">The conversations were practical, ambitious, and genuinely useful.</p><strong data-gjs-type="text">Maya Rao · Product Lead</strong></article>
    <article data-gjs-type="card" class="wb-ac-quote-card"><p data-gjs-type="paragraph">A rare event where every session earned its place.</p><strong data-gjs-type="text">Jon Bell · Founder</strong></article>
    <article data-gjs-type="card" class="wb-ac-quote-card"><p data-gjs-type="paragraph">The programme made complex ideas feel immediately actionable.</p><strong data-gjs-type="text">Ana Silva · Research Director</strong></article>
    <article data-gjs-type="card" class="wb-ac-quote-card" aria-hidden="true"><p>The conversations were practical, ambitious, and genuinely useful.</p><strong>Maya Rao · Product Lead</strong></article>
    <article data-gjs-type="card" class="wb-ac-quote-card" aria-hidden="true"><p>A rare event where every session earned its place.</p><strong>Jon Bell · Founder</strong></article>
    <article data-gjs-type="card" class="wb-ac-quote-card" aria-hidden="true"><p>The programme made complex ideas feel immediately actionable.</p><strong>Ana Silva · Research Director</strong></article>
  </div>
</section>`.trim(), ['carousel', 'testimonials', 'marquee']),

  asAsset('grid', 'Grid and Dot Background', 'Subtle technical grid background for event sections and hero content.', `
<section data-gjs-type="aceternity-grid" data-aceternity-name="grid" class="wb-ac-component wb-ac-grid-background" style="${sectionBase}">
  <div class="wb-ac-grid-fade" aria-hidden="true"></div>
  <div class="wb-ac-content" style="${contentBase}">
    <h2 data-gjs-type="heading" style="${headingBase}">Structure for ambitious ideas</h2>
    <p data-gjs-type="paragraph" style="${paragraphBase}">A precise grid treatment that keeps the content, not the effect, in control.</p>
  </div>
</section>`.trim(), ['background', 'grid', 'hero']),

  asAsset('sparkles', 'Sparkles', 'CSS sparkle field with editable headline and reduced-motion support.', `
<section data-gjs-type="aceternity-sparkles" data-aceternity-name="sparkles" class="wb-ac-component wb-ac-sparkles" style="${sectionBase}">
  <div class="wb-ac-sparkle-field" aria-hidden="true"></div>
  <div class="wb-ac-content" style="${contentBase}"><h2 data-gjs-type="heading" style="${headingBase}">The room is ready</h2><p data-gjs-type="paragraph" style="${paragraphBase}">A restrained field of light for launches, awards, and closing moments.</p></div>
</section>`.trim(), ['background', 'sparkles', 'animation']),

  asAsset('meteors', 'Meteor Effect', 'Animated meteor field for high-impact dark sections.', `
<section data-gjs-type="aceternity-meteors" data-aceternity-name="meteors" class="wb-ac-component wb-ac-meteors" style="${sectionBase}">
  <div class="wb-ac-meteor-field" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <div class="wb-ac-content" style="${contentBase}"><h2 data-gjs-type="heading" style="${headingBase}">Momentum you can feel</h2><p data-gjs-type="paragraph" style="${paragraphBase}">Use motion sparingly to signal a major event milestone.</p></div>
</section>`.trim(), ['background', 'meteor', 'animation']),
  ...ACETERNITY_STATIC_ASSETS,
  ...ACETERNITY_INTERACTIVE_ASSETS,
  ...ACETERNITY_EXTENDED_ASSETS,
];

const content = (id: string, label: string, selector: string): PropertyDefinition => ({
  id,
  type: 'Text',
  label,
  target: { kind: 'content', selector },
});

const color = (id: string, label: string, css: string, selector?: string, defaultValue?: string): PropertyDefinition => ({
  id,
  type: 'Color',
  label,
  defaultValue,
  target: { kind: 'style', css, selector },
});

const attribute = (id: string, label: string, name: string, type = 'Text'): PropertyDefinition => ({
  id,
  type,
  label,
  target: { kind: 'attribute', name },
});

function componentManifest(name: AceternityBuilderComponentName, title: string, properties: PropertyDefinition[]): ComponentManifest {
  return {
    id: typeFor(name),
    title,
    category: 'Aceternity',
    description: 'Framework-neutral EVENTOS adapter for an Aceternity UI component.',
    tags: ['aceternity', name],
    supportsTheme: true,
    supportsAnimation: true,
    supportsResponsive: true,
    defaults: { 'data-aceternity-name': name },
    schema: { groups: [{ groupId: 'CONTENT', properties }] },
  };
}

const sectionContent = [
  content('data-heading', 'Heading', 'h1,h2,h3'),
  content('data-description', 'Description', 'p'),
  color('background-color', 'Background', 'background-color', ':self', '#06070d'),
  color('heading-color', 'Heading color', 'color', 'h1,h2,h3', '#f8fafc'),
  color('text-color', 'Text color', 'color', 'p', '#aeb7c8'),
  color('effect-primary', 'Effect primary', '--ac-primary', ':self', '#8b5cf6'),
  color('effect-secondary', 'Effect secondary', '--ac-secondary', ':self', '#22d3ee'),
];

export const ACETERNITY_BUILDER_MANIFESTS: ComponentManifest[] = [
  componentManifest('aurora-background', 'Aurora Background', sectionContent),
  componentManifest('spotlight', 'Spotlight', sectionContent),
  componentManifest('grid', 'Grid and Dot Background', sectionContent),
  componentManifest('sparkles', 'Sparkles', sectionContent),
  componentManifest('meteors', 'Meteor Effect', sectionContent),
  componentManifest('background-gradient', 'Background Gradient Card', [
    content('data-eyebrow', 'Eyebrow', 'p:first-of-type'),
    content('data-heading', 'Heading', 'h1,h2,h3'),
    content('data-description', 'Description', 'p:last-of-type'),
    color('surface-color', 'Card background', 'background-color', '.wb-ac-gradient-surface', '#0b0d16'),
    color('effect-primary', 'Gradient primary', '--ac-primary', ':self', '#8b5cf6'),
    color('effect-secondary', 'Gradient secondary', '--ac-secondary', ':self', '#22d3ee'),
  ]),
  componentManifest('hover-border-gradient', 'Hover Border Gradient', [
    content('data-label', 'Button label', 'span'),
    attribute('href', 'Link', 'href', 'Link'),
    color('button-background', 'Button background', 'background-color', 'span', '#0b0d16'),
    color('text-color', 'Text color', 'color', 'span', '#ffffff'),
    color('effect-primary', 'Border primary', '--ac-primary', ':self', '#8b5cf6'),
    color('effect-secondary', 'Border secondary', '--ac-secondary', ':self', '#22d3ee'),
  ]),
  componentManifest('moving-border', 'Moving Border', [
    content('data-label', 'Button label', 'span:last-child'),
    attribute('href', 'Link', 'href', 'Link'),
    color('button-background', 'Button background', 'background-color', 'span:last-child', '#0a0c14'),
    color('text-color', 'Text color', 'color', 'span:last-child', '#ffffff'),
    color('effect-primary', 'Border primary', '--ac-primary', ':self', '#8b5cf6'),
    color('effect-secondary', 'Border secondary', '--ac-secondary', ':self', '#22d3ee'),
  ]),
  componentManifest('bento-grid', 'Bento Grid', [
    content('data-heading', 'Section heading', 'h2'),
    color('section-background', 'Section background', 'background-color', ':self', '#070812'),
    color('card-background', 'Card background', 'background', '.wb-ac-bento-item', '#10131f'),
  ]),
  componentManifest('text-generate-effect', 'Text Generate Effect', [
    content('data-text', 'Text', '.wb-ac-generated-text'),
    color('text-color', 'Text color', 'color', '.wb-ac-generated-text', '#f8fafc'),
  ]),
  componentManifest('typewriter-effect', 'Typewriter Effect', [
    content('data-text', 'Text', '.wb-ac-typewriter-text'),
    attribute('data-speed', 'Duration (seconds)', 'data-speed'),
    color('text-color', 'Text color', 'color', '.wb-ac-typewriter-text', '#f8fafc'),
  ]),
  componentManifest('infinite-moving-cards', 'Infinite Moving Cards', [
    attribute('data-speed', 'Duration (seconds)', 'data-speed'),
    {
      id: 'data-direction',
      type: 'Select',
      label: 'Direction',
      options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }],
      target: { kind: 'attribute', name: 'data-direction' },
    },
    color('section-background', 'Background', 'background-color', ':self', '#070812'),
  ]),
  ...ACETERNITY_STATIC_MANIFESTS,
  ...ACETERNITY_INTERACTIVE_MANIFESTS,
  ...ACETERNITY_EXTENDED_MANIFESTS,
];

// Existing documents may already contain one of the earlier adapter IDs. Keep every
// synced source ID registered for loading, while restricting new inserts to the
// individually fidelity-reviewed definitions above.
export const ACETERNITY_BUILDER_TYPES = ACETERNITY_CATALOG.map(item => item.id);

export function getAceternityBuilderAsset(name: string): WebsiteComponentAsset | undefined {
  if (!(ACETERNITY_FIDELITY_REVIEWED_COMPONENT_NAMES as readonly string[]).includes(name)) return undefined;
  return ACETERNITY_BUILDER_ASSETS.find(asset => asset.id === typeFor(name))
    || getAceternityStaticAsset(name)
    || getAceternityInteractiveAsset(name)
    || getAceternityExtendedAsset(name);
}
