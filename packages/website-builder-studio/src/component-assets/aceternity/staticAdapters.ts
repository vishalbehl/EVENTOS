import type { ComponentManifest, PropertyDefinition } from '../../core/properties/PropertyRegistry';
import type { WebsiteComponentAsset } from '../types';

export const ACETERNITY_STATIC_COMPONENT_NAMES = [
  'background-beams',
  'background-beams-with-collision',
  'background-boxes',
  'background-gradient-animation',
  'background-lines',
  'dotted-glow-background',
  'noise-background',
  'shooting-stars',
  'stars-background',
  'spotlight-new',
  'wavy-background',
  'vortex',
  'card-hover-effect',
  'card-spotlight',
  'glowing-effect',
  'glowing-stars',
  'wobble-card',
  'focus-cards',
  'colourful-text',
  'flip-words',
  'hero-highlight',
  'pointer-highlight',
  'squiggly-text',
  'text-hover-effect',
  'magnetic-button',
  'stateful-button',
  'sticky-banner',
] as const;

type StaticComponentName = (typeof ACETERNITY_STATIC_COMPONENT_NAMES)[number];
const typeFor = (name: string) => `aceternity-${name}`;

function asset(name: StaticComponentName, title: string, description: string, html: string, tags: string[]): WebsiteComponentAsset {
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

const sectionStyle = 'position:relative;width:100%;min-height:500px;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:76px 32px;background-color:#06070d;color:#f8fafc;box-sizing:border-box;';
const contentStyle = 'position:relative;z-index:3;width:100%;max-width:920px;margin:0 auto;text-align:center;';
const headingStyle = 'margin:0 0 18px;font-size:clamp(38px,6vw,70px);line-height:1.05;font-weight:900;letter-spacing:0;color:#f8fafc;';
const copyStyle = 'max-width:680px;margin:0 auto;color:#aeb7c8;font-size:18px;line-height:1.65;';

function effectSection(name: StaticComponentName, title: string, heading: string, copy: string): string {
  return `<section data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" class="wb-ac-component wb-ac-static wb-ac-${name}" style="${sectionStyle}">
  <div class="wb-ac-effect-layer" aria-hidden="true"></div>
  <div class="wb-ac-content" style="${contentStyle}"><h2 data-gjs-type="heading" style="${headingStyle}">${heading}</h2><p data-gjs-type="paragraph" style="${copyStyle}">${copy}</p></div>
</section>`;
}

function cardSection(name: StaticComponentName, title: string, copy: string): string {
  return `<section data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" class="wb-ac-component wb-ac-static wb-ac-card-section wb-ac-${name}" style="width:100%;padding:72px 32px;background-color:#070812;color:#f8fafc;box-sizing:border-box;">
  <div style="max-width:1120px;margin:0 auto;"><h2 data-gjs-type="heading" style="margin:0 0 28px;font-size:40px;line-height:1.12;color:#f8fafc;">${title}</h2><div class="wb-ac-card-grid">
    <article data-gjs-type="card" class="wb-ac-effect-card"><span>01</span><h3 data-gjs-type="heading">Built for attention</h3><p data-gjs-type="paragraph">${copy}</p></article>
    <article data-gjs-type="card" class="wb-ac-effect-card"><span>02</span><h3 data-gjs-type="heading">Made for clarity</h3><p data-gjs-type="paragraph">Keep the interaction expressive without obscuring the message.</p></article>
    <article data-gjs-type="card" class="wb-ac-effect-card"><span>03</span><h3 data-gjs-type="heading">Ready to adapt</h3><p data-gjs-type="paragraph">Select every card and edit its content, spacing, colors, and typography.</p></article>
  </div></div>
</section>`;
}

function textSection(name: StaticComponentName, title: string, text: string): string {
  return `<div data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" class="wb-ac-component wb-ac-static wb-ac-${name}" style="max-width:1040px;margin:44px auto;padding:32px;color:#f8fafc;box-sizing:border-box;">
  <p data-gjs-type="subheading" style="margin:0 0 12px;color:#22d3ee;font-size:12px;font-weight:850;text-transform:uppercase;">${title}</p>
  <h2 data-gjs-type="heading" class="wb-ac-text-effect" style="margin:0;font-size:clamp(38px,6vw,72px);line-height:1.08;font-weight:900;color:#f8fafc;">${text}</h2>
</div>`;
}

function button(name: StaticComponentName, title: string): string {
  return `<a data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" href="#register" class="wb-ac-component wb-ac-static wb-ac-${name}" style="display:inline-flex;align-items:center;justify-content:center;min-height:52px;margin:24px;padding:0 28px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background-color:#111522;color:#ffffff;text-decoration:none;font-size:15px;font-weight:850;box-sizing:border-box;">${title}</a>`;
}

export const ACETERNITY_STATIC_ASSETS: WebsiteComponentAsset[] = [
  asset('background-beams', 'Background Beams', 'Animated light beams behind editable content.', effectSection('background-beams', 'Background Beams', 'A clear signal through the noise', 'Animated beams bring depth to an event hero without competing with its message.'), ['background', 'beams']),
  asset('background-beams-with-collision', 'Background Beams With Collision', 'Intersecting beam animation for launch moments.', effectSection('background-beams-with-collision', 'Beams With Collision', 'Where bright ideas collide', 'A focused background effect for launches, keynotes, and programme highlights.'), ['background', 'beams']),
  asset('background-boxes', 'Background Boxes', 'Interactive-looking box grid with CSS-only motion.', effectSection('background-boxes', 'Background Boxes', 'Every connection changes the picture', 'A modular grid treatment for technology and innovation events.'), ['background', 'grid']),
  asset('background-gradient-animation', 'Background Gradient Animation', 'Continuous animated gradient section.', effectSection('background-gradient-animation', 'Gradient Animation', 'A stage that keeps moving', 'Use a restrained animated color field for a memorable first impression.'), ['background', 'gradient']),
  asset('background-lines', 'Background Lines', 'Animated flowing line backdrop.', effectSection('background-lines', 'Background Lines', 'Ideas move in more than one direction', 'Layered lines provide motion while preserving content readability.'), ['background', 'lines']),
  asset('dotted-glow-background', 'Dotted Glow Background', 'Glowing technical dot field.', effectSection('dotted-glow-background', 'Dotted Glow', 'Precision with a pulse', 'A quiet glowing matrix for technical conferences and product showcases.'), ['background', 'dots']),
  asset('noise-background', 'Noise Background', 'Textured background with subtle moving grain.', effectSection('noise-background', 'Noise Background', 'Texture without distraction', 'A tactile surface that gives dark sections a more considered finish.'), ['background', 'noise']),
  asset('shooting-stars', 'Shooting Stars', 'Animated shooting stars over event content.', effectSection('shooting-stars', 'Shooting Stars', 'A moment worth looking up for', 'Use this effect for openings, awards, and closing celebrations.'), ['background', 'stars']),
  asset('stars-background', 'Stars Background', 'Layered star field with soft twinkle.', effectSection('stars-background', 'Stars Background', 'A wider view of what comes next', 'A calm star field for ambitious event themes and future-facing stories.'), ['background', 'stars']),
  asset('spotlight-new', 'Spotlight New', 'Updated spotlight treatment with editable content.', effectSection('spotlight-new', 'Spotlight New', 'Put the important thing first', 'Focused light and disciplined typography keep attention exactly where it belongs.'), ['background', 'spotlight']),
  asset('wavy-background', 'Wavy Background', 'Animated waves with configurable colors.', effectSection('wavy-background', 'Wavy Background', 'Energy that travels through the room', 'A fluid visual rhythm for music, culture, and community events.'), ['background', 'waves']),
  asset('vortex', 'Vortex Background', 'Swirling particle-style CSS background.', effectSection('vortex', 'Vortex', 'Bring every thread into focus', 'A controlled vortex effect gives a call to action real gravity.'), ['background', 'vortex']),

  asset('card-hover-effect', 'Card Hover Effect', 'Card grid with a shared hover focus treatment.', cardSection('card-hover-effect', 'Explore the programme', 'Hover focus makes related content easier to scan.'), ['cards', 'hover']),
  asset('card-spotlight', 'Card Spotlight', 'Cards with focused radial highlights.', cardSection('card-spotlight', 'What attendees can expect', 'Each card carries its own subtle spotlight.'), ['cards', 'spotlight']),
  asset('glowing-effect', 'Glowing Effect', 'Cards with restrained glowing borders.', cardSection('glowing-effect', 'Designed around real outcomes', 'A luminous edge signals priority without becoming decoration.'), ['cards', 'glow']),
  asset('glowing-stars', 'Glowing Stars Card', 'Star-lit cards with motion and hover states.', cardSection('glowing-stars', 'Stories from the event', 'Tiny star details add atmosphere to editorial cards.'), ['cards', 'stars']),
  asset('wobble-card', 'Wobble Card', 'Responsive cards with a subtle hover transform.', cardSection('wobble-card', 'Meet the people shaping the agenda', 'A measured hover shift gives the grid a tactile response.'), ['cards', 'hover']),
  asset('focus-cards', 'Focus Cards', 'Card set that softens non-hovered siblings.', cardSection('focus-cards', 'Choose your track', 'Focus behavior helps visitors compare several programme paths.'), ['cards', 'focus']),

  asset('colourful-text', 'Colourful Text', 'Animated multi-color display headline.', textSection('colourful-text', 'Colourful Text', 'Make the headline part of the experience.'), ['text', 'color']),
  asset('flip-words', 'Flip Words', 'Word-changing headline treatment with static-safe fallback.', textSection('flip-words', 'Flip Words', 'Build events that feel focused, useful, and alive.'), ['text', 'flip']),
  asset('hero-highlight', 'Hero Highlight', 'Highlighted phrase treatment for hero copy.', textSection('hero-highlight', 'Hero Highlight', 'Turn one clear idea into the centre of the page.'), ['text', 'highlight']),
  asset('pointer-highlight', 'Pointer Highlight', 'Hand-drawn pointer and highlight effect.', textSection('pointer-highlight', 'Pointer Highlight', 'Point directly to the detail people should remember.'), ['text', 'highlight']),
  asset('squiggly-text', 'Squiggly Text', 'Animated squiggle underline headline.', textSection('squiggly-text', 'Squiggly Text', 'Serious ideas can still have a human edge.'), ['text', 'underline']),
  asset('text-hover-effect', 'Text Hover Effect', 'Outline-to-color hover headline.', textSection('text-hover-effect', 'Text Hover Effect', 'A headline that rewards a closer look.'), ['text', 'hover']),

  asset('magnetic-button', 'Magnetic Button', 'Premium CTA with a safe hover translation.', button('magnetic-button', 'Join the event'), ['button', 'hover']),
  asset('stateful-button', 'Stateful Button', 'Action button with loading-ready visual states.', button('stateful-button', 'Reserve your place'), ['button', 'state']),
  asset('sticky-banner', 'Sticky Banner', 'Dismissible-style announcement banner for page tops.', `<aside data-gjs-type="${typeFor('sticky-banner')}" data-aceternity-name="sticky-banner" class="wb-ac-component wb-ac-static wb-ac-sticky-banner" style="position:sticky;top:0;z-index:70;width:100%;display:flex;align-items:center;justify-content:center;gap:14px;padding:12px 48px;background-color:#7c3aed;color:#ffffff;box-sizing:border-box;"><strong data-gjs-type="text">Registration closes Friday</strong><a data-gjs-type="button" href="#register" style="color:#ffffff;font-weight:850;">Register now</a></aside>`, ['banner', 'navigation']),
];

const content = (id: string, label: string, selector: string): PropertyDefinition => ({ id, type: 'Text', label, target: { kind: 'content', selector } });
const color = (id: string, label: string, css: string, selector?: string, defaultValue?: string): PropertyDefinition => ({ id, type: 'Color', label, defaultValue, target: { kind: 'style', css, selector } });
const attr = (id: string, label: string, name: string, type = 'Text', selector?: string): PropertyDefinition => ({ id, type, label, target: { kind: 'attribute', name, selector } });

function manifest(name: StaticComponentName, title: string, properties: PropertyDefinition[]): ComponentManifest {
  return {
    id: typeFor(name), title, category: 'Aceternity', supportsTheme: true, supportsAnimation: true, supportsResponsive: true,
    description: 'Framework-neutral EVENTOS adapter for an Aceternity UI component.',
    schema: { groups: [{ groupId: 'CONTENT', properties }] },
  };
}

const effectProperties = [
  content('data-heading', 'Heading', 'h1,h2,h3'),
  content('data-description', 'Description', 'p'),
  color('background-color', 'Background', 'background-color', ':self', '#06070d'),
  color('heading-color', 'Heading color', 'color', 'h1,h2,h3', '#f8fafc'),
  color('text-color', 'Text color', 'color', 'p', '#aeb7c8'),
  color('effect-primary', 'Effect primary', '--ac-primary', ':self', '#8b5cf6'),
  color('effect-secondary', 'Effect secondary', '--ac-secondary', ':self', '#22d3ee'),
];
const cardProperties = [
  content('data-heading', 'Section heading', 'h2'),
  color('background-color', 'Background', 'background-color', ':self', '#070812'),
  color('card-background', 'Card background', 'background-color', '.wb-ac-effect-card', '#10131f'),
  color('effect-primary', 'Effect color', '--ac-primary', ':self', '#8b5cf6'),
];
const textProperties = [
  content('data-eyebrow', 'Eyebrow', 'p'),
  content('data-text', 'Text', 'h1,h2,h3'),
  color('text-color', 'Text color', 'color', 'h1,h2,h3', '#f8fafc'),
  color('effect-primary', 'Effect primary', '--ac-primary', ':self', '#8b5cf6'),
  color('effect-secondary', 'Effect secondary', '--ac-secondary', ':self', '#22d3ee'),
];

const effectNames = ACETERNITY_STATIC_COMPONENT_NAMES.slice(0, 12);
const cardNames = ACETERNITY_STATIC_COMPONENT_NAMES.slice(12, 18);
const textNames = ACETERNITY_STATIC_COMPONENT_NAMES.slice(18, 24);

export const ACETERNITY_STATIC_MANIFESTS: ComponentManifest[] = [
  ...effectNames.map(name => manifest(name, ACETERNITY_STATIC_ASSETS.find(item => item.id === typeFor(name))?.name || name, effectProperties)),
  ...cardNames.map(name => manifest(name, ACETERNITY_STATIC_ASSETS.find(item => item.id === typeFor(name))?.name || name, cardProperties)),
  ...textNames.map(name => manifest(name, ACETERNITY_STATIC_ASSETS.find(item => item.id === typeFor(name))?.name || name, textProperties)),
  manifest('magnetic-button', 'Magnetic Button', [content('data-label', 'Label', ':self'), attr('href', 'Link', 'href', 'Link'), color('background', 'Background', 'background-color', ':self', '#111522'), color('text-color', 'Text color', 'color', ':self', '#ffffff')]),
  manifest('stateful-button', 'Stateful Button', [content('data-label', 'Label', ':self'), attr('href', 'Link', 'href', 'Link'), color('background', 'Background', 'background-color', ':self', '#111522'), color('text-color', 'Text color', 'color', ':self', '#ffffff')]),
  manifest('sticky-banner', 'Sticky Banner', [content('data-message', 'Message', 'strong'), content('data-link-label', 'Link label', 'a'), attr('data-link', 'Link', 'href', 'Link', 'a'), color('background', 'Background', 'background-color', ':self', '#7c3aed'), color('text-color', 'Text color', 'color', ':self', '#ffffff')]),
];

export const ACETERNITY_STATIC_TYPES = ACETERNITY_STATIC_COMPONENT_NAMES.map(typeFor);

export function getAceternityStaticAsset(name: string): WebsiteComponentAsset | undefined {
  return ACETERNITY_STATIC_ASSETS.find(item => item.id === typeFor(name));
}
