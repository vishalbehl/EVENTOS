import type { ComponentManifest, PropertyDefinition } from '../../core/properties/PropertyRegistry';
import type { WebsiteComponentAsset } from '../types';

export const ACETERNITY_INTERACTIVE_COMPONENT_NAMES = [
  'animated-modal',
  'animated-tooltip',
  'apple-cards-carousel',
  'animated-testimonials',
  'carousel',
  'images-slider',
  'tabs',
  'floating-navbar',
  'navbar-menu',
  'resizable-navbar',
  'sidebar',
  'floating-dock',
  'sticky-scroll-reveal',
  'multi-step-loader',
  'loader',
  'link-preview',
] as const;

type InteractiveName = (typeof ACETERNITY_INTERACTIVE_COMPONENT_NAMES)[number];
const typeFor = (name: string) => `aceternity-${name}`;

function asset(name: InteractiveName, title: string, description: string, html: string, tags: string[]): WebsiteComponentAsset {
  return { id: typeFor(name), name: title, kind: 'component', group: 'Aceternity', description, tags: ['aceternity', 'interactive', ...tags], preview: { accent: '#8b5cf6', background: '#070812', title, subtitle: 'Runtime component' }, html, json: { components: [] } };
}

const carouselCards = `
  <div class="wb-ac-carousel-viewport">
    <div class="wb-ac-carousel-track" data-role="carousel-track">
      <article data-gjs-type="card" class="wb-ac-carousel-slide is-active"><span>01</span><h3 data-gjs-type="heading">Opening keynote</h3><p data-gjs-type="paragraph">A clear view of the forces shaping the next year.</p></article>
      <article data-gjs-type="card" class="wb-ac-carousel-slide"><span>02</span><h3 data-gjs-type="heading">Expert forum</h3><p data-gjs-type="paragraph">Focused discussion with people doing the work.</p></article>
      <article data-gjs-type="card" class="wb-ac-carousel-slide"><span>03</span><h3 data-gjs-type="heading">Closing exchange</h3><p data-gjs-type="paragraph">The ideas, decisions, and connections to carry forward.</p></article>
    </div>
  </div>
  <div class="wb-ac-carousel-controls"><button type="button" data-carousel-prev aria-label="Previous slide">&#8592;</button><span data-carousel-status>1 / 3</span><button type="button" data-carousel-next aria-label="Next slide">&#8594;</button></div>`;

function carousel(name: InteractiveName, title: string): string {
  return `<section data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" data-wb-runtime="carousel" data-autoplay="false" data-interval="5000" tabindex="0" aria-roledescription="carousel" class="wb-ac-component wb-ac-interactive wb-ac-carousel wb-ac-${name}" style="width:100%;padding:72px 32px;background-color:#070812;color:#f8fafc;box-sizing:border-box;"><div style="max-width:1080px;margin:0 auto;"><h2 data-gjs-type="heading" style="margin:0 0 26px;font-size:42px;color:#f8fafc;">${title}</h2>${carouselCards}</div></section>`;
}

function navigation(name: InteractiveName, title: string): string {
  return `<header data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" data-wb-runtime="navigation" class="wb-ac-component wb-ac-interactive wb-ac-runtime-nav wb-ac-${name}" style="position:sticky;top:16px;z-index:80;max-width:1120px;margin:16px auto;padding:10px 14px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background-color:rgba(8,10,18,.9);color:#f8fafc;box-sizing:border-box;"><a data-gjs-type="button" href="/" class="wb-ac-nav-brand">${title}</a><button type="button" data-nav-toggle aria-expanded="false" aria-label="Toggle navigation">Menu</button><nav data-role="nav-menu"><a data-gjs-type="button" href="/">Home</a><a data-gjs-type="button" href="#agenda">Agenda</a><a data-gjs-type="button" href="#speakers">Speakers</a><a data-gjs-type="button" href="#register" class="wb-ac-nav-cta">Register</a></nav></header>`;
}

export const ACETERNITY_INTERACTIVE_ASSETS: WebsiteComponentAsset[] = [
  asset('animated-modal', 'Animated Modal', 'Accessible modal dialog with editable trigger and dialog content.', `<section data-gjs-type="${typeFor('animated-modal')}" data-aceternity-name="animated-modal" data-wb-runtime="modal" class="wb-ac-component wb-ac-interactive wb-ac-modal-demo" style="padding:56px 32px;text-align:center;background-color:#070812;color:#f8fafc;box-sizing:border-box;"><button type="button" data-modal-open class="wb-ac-primary-action">Open event details</button><div data-modal-backdrop class="wb-ac-modal-backdrop" hidden><div role="dialog" aria-modal="true" aria-labelledby="wb-ac-modal-title" class="wb-ac-modal-panel"><button type="button" data-modal-close class="wb-ac-modal-close" aria-label="Close dialog">&#215;</button><h2 id="wb-ac-modal-title" data-gjs-type="heading">Event details</h2><p data-gjs-type="paragraph">Edit this content, then preview the page to test the accessible dialog behavior.</p><a data-gjs-type="button" href="#register" class="wb-ac-primary-action">Register now</a></div></div></section>`, ['modal', 'overlay']),
  asset('animated-tooltip', 'Animated Tooltip', 'Hover and keyboard tooltip for people or compact details.', `<div data-gjs-type="${typeFor('animated-tooltip')}" data-aceternity-name="animated-tooltip" class="wb-ac-component wb-ac-interactive wb-ac-tooltip-group" style="display:flex;align-items:center;justify-content:center;gap:0;padding:42px;background-color:#070812;color:#f8fafc;box-sizing:border-box;"><button type="button" class="wb-ac-avatar" data-tooltip="Programme Director" aria-label="Maya Rao, Programme Director">MR</button><button type="button" class="wb-ac-avatar" data-tooltip="Experience Lead" aria-label="Jon Bell, Experience Lead">JB</button><button type="button" class="wb-ac-avatar" data-tooltip="Research Chair" aria-label="Ana Silva, Research Chair">AS</button></div>`, ['tooltip', 'people']),
  asset('apple-cards-carousel', 'Apple Cards Carousel', 'Large editorial card carousel with controls.', carousel('apple-cards-carousel', 'Highlights worth exploring'), ['carousel', 'cards']),
  asset('animated-testimonials', 'Animated Testimonials', 'Accessible testimonial carousel with selectable slides.', carousel('animated-testimonials', 'What attendees said'), ['carousel', 'testimonials']),
  asset('carousel', 'Carousel', 'General-purpose content carousel with autoplay controls.', carousel('carousel', 'Programme highlights'), ['carousel', 'content']),
  asset('images-slider', 'Images Slider', 'Full-width image-oriented slider with keyboard controls.', carousel('images-slider', 'Scenes from the event'), ['slider', 'images']),
  asset('tabs', 'Tabs', 'Keyboard-accessible tab set with independently editable panels.', `<section data-gjs-type="${typeFor('tabs')}" data-aceternity-name="tabs" data-wb-runtime="tabs" class="wb-ac-component wb-ac-interactive wb-ac-runtime-tabs" style="width:100%;padding:72px 32px;background-color:#070812;color:#f8fafc;box-sizing:border-box;"><div style="max-width:980px;margin:0 auto;"><div role="tablist" aria-label="Programme days"><button type="button" role="tab" id="day-one-tab" aria-controls="day-one" aria-selected="true">Day one</button><button type="button" role="tab" id="day-two-tab" aria-controls="day-two" aria-selected="false">Day two</button><button type="button" role="tab" id="day-three-tab" aria-controls="day-three" aria-selected="false">Day three</button></div><div id="day-one" role="tabpanel" aria-labelledby="day-one-tab"><h3 data-gjs-type="heading">Ideas and direction</h3><p data-gjs-type="paragraph">Opening keynotes, strategic context, and the questions that frame the event.</p></div><div id="day-two" role="tabpanel" aria-labelledby="day-two-tab" hidden><h3 data-gjs-type="heading">Practice and exchange</h3><p data-gjs-type="paragraph">Workshops, product sessions, and expert discussions.</p></div><div id="day-three" role="tabpanel" aria-labelledby="day-three-tab" hidden><h3 data-gjs-type="heading">Decisions and next steps</h3><p data-gjs-type="paragraph">Working sessions and closing commitments.</p></div></div></section>`, ['tabs', 'programme']),
  asset('floating-navbar', 'Floating Navbar', 'Responsive floating page navigation.', navigation('floating-navbar', 'EVENTOS'), ['navigation', 'navbar']),
  asset('navbar-menu', 'Navbar Menu', 'Responsive navigation with page and section links.', navigation('navbar-menu', 'SUMMIT'), ['navigation', 'menu']),
  asset('resizable-navbar', 'Resizable Navbar', 'Compact-on-scroll responsive navigation.', navigation('resizable-navbar', 'CONFERENCE'), ['navigation', 'navbar']),
  asset('sidebar', 'Sidebar', 'Responsive vertical page navigation.', `<aside data-gjs-type="${typeFor('sidebar')}" data-aceternity-name="sidebar" data-wb-runtime="navigation" class="wb-ac-component wb-ac-interactive wb-ac-runtime-sidebar" style="width:280px;min-height:480px;padding:18px;border:1px solid rgba(255,255,255,.1);background-color:#0b0e18;color:#f8fafc;box-sizing:border-box;"><strong data-gjs-type="heading">Event guide</strong><nav data-role="nav-menu"><a data-gjs-type="button" href="#overview">Overview</a><a data-gjs-type="button" href="#agenda">Agenda</a><a data-gjs-type="button" href="#speakers">Speakers</a><a data-gjs-type="button" href="#venue">Venue</a></nav></aside>`, ['navigation', 'sidebar']),
  asset('floating-dock', 'Floating Dock', 'Compact icon-style navigation dock with real links.', `<nav data-gjs-type="${typeFor('floating-dock')}" data-aceternity-name="floating-dock" class="wb-ac-component wb-ac-interactive wb-ac-floating-dock" aria-label="Quick navigation" style="display:flex;align-items:center;justify-content:center;gap:8px;width:max-content;margin:24px auto;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background-color:#0b0e18;color:#f8fafc;box-sizing:border-box;"><a data-gjs-type="button" href="/" title="Home">H</a><a data-gjs-type="button" href="#agenda" title="Agenda">A</a><a data-gjs-type="button" href="#speakers" title="Speakers">S</a><a data-gjs-type="button" href="#venue" title="Venue">V</a></nav>`, ['navigation', 'dock']),
  asset('sticky-scroll-reveal', 'Sticky Scroll Reveal', 'Sticky content sequence activated during preview scrolling.', `<section data-gjs-type="${typeFor('sticky-scroll-reveal')}" data-aceternity-name="sticky-scroll-reveal" data-wb-runtime="reveal" class="wb-ac-component wb-ac-interactive wb-ac-sticky-reveal" style="width:100%;padding:80px 32px;background-color:#070812;color:#f8fafc;box-sizing:border-box;"><div class="wb-ac-sticky-reveal-grid"><div class="wb-ac-sticky-copy"><p data-reveal-index="0" class="is-active">01 · Understand the challenge</p><p data-reveal-index="1">02 · Meet the people solving it</p><p data-reveal-index="2">03 · Leave with a practical direction</p></div><div class="wb-ac-reveal-panels"><article data-gjs-type="card" data-reveal-panel="0" class="is-active"><h3 data-gjs-type="heading">Context</h3><p data-gjs-type="paragraph">Begin with the facts and questions that matter.</p></article><article data-gjs-type="card" data-reveal-panel="1"><h3 data-gjs-type="heading">Exchange</h3><p data-gjs-type="paragraph">Put expertise and lived experience in the same room.</p></article><article data-gjs-type="card" data-reveal-panel="2"><h3 data-gjs-type="heading">Action</h3><p data-gjs-type="paragraph">Turn the programme into useful next steps.</p></article></div></div></section>`, ['scroll', 'reveal']),
  asset('multi-step-loader', 'Multi Step Loader', 'Editable loading sequence for approved async experiences.', `<div data-gjs-type="${typeFor('multi-step-loader')}" data-aceternity-name="multi-step-loader" data-wb-runtime="step-loader" data-interval="1200" class="wb-ac-component wb-ac-interactive wb-ac-step-loader" style="max-width:620px;margin:40px auto;padding:28px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background-color:#0b0e18;color:#f8fafc;box-sizing:border-box;"><div class="wb-ac-loader-ring" aria-hidden="true"></div><div><strong data-loader-current>Preparing your experience</strong><ol><li class="is-active">Loading programme</li><li>Connecting event data</li><li>Finishing preview</li></ol></div></div>`, ['loader', 'steps']),
  asset('loader', 'Loader', 'Small production-safe loading indicator.', `<div data-gjs-type="${typeFor('loader')}" data-aceternity-name="loader" class="wb-ac-component wb-ac-interactive wb-ac-loader" role="status" aria-live="polite" style="display:inline-flex;align-items:center;gap:12px;margin:24px;padding:14px 18px;border-radius:10px;background-color:#0b0e18;color:#f8fafc;box-sizing:border-box;"><span class="wb-ac-loader-ring" aria-hidden="true"></span><span data-gjs-type="text">Loading event details</span></div>`, ['loader', 'feedback']),
  asset('link-preview', 'Link Preview', 'Link with an accessible preview card on hover and focus.', `<p data-gjs-type="${typeFor('link-preview')}" data-aceternity-name="link-preview" class="wb-ac-component wb-ac-interactive wb-ac-link-preview" style="max-width:720px;margin:32px auto;padding:28px;background-color:#070812;color:#cbd5e1;font-size:18px;line-height:1.6;box-sizing:border-box;">Explore the <a data-gjs-type="button" href="#speakers" aria-describedby="speaker-preview">speaker programme<span id="speaker-preview" role="tooltip"><strong>Speaker programme</strong><small>Profiles, sessions, and topic areas</small></span></a> before registration.</p>`, ['link', 'preview']),
];

const content = (id: string, label: string, selector: string): PropertyDefinition => ({ id, type: 'Text', label, target: { kind: 'content', selector } });
const attr = (id: string, label: string, name: string, type = 'Text'): PropertyDefinition => ({ id, type, label, target: { kind: 'attribute', name } });
const color = (id: string, label: string, css: string, selector?: string, defaultValue?: string): PropertyDefinition => ({ id, type: 'Color', label, defaultValue, target: { kind: 'style', css, selector } });
function manifest(name: InteractiveName, title: string, properties: PropertyDefinition[]): ComponentManifest { return { id: typeFor(name), title, category: 'Aceternity', supportsTheme: true, supportsAnimation: true, supportsResponsive: true, description: 'Accessible EVENTOS runtime adapter for an Aceternity UI component.', schema: { groups: [{ groupId: 'CONTENT', properties }] } }; }

const carouselProps = [content('data-heading', 'Heading', 'h2'), attr('data-autoplay', 'Autoplay', 'data-autoplay', 'Toggle'), attr('data-interval', 'Interval (ms)', 'data-interval'), color('background', 'Background', 'background-color', ':self', '#070812')];
const navigationProps = [content('data-brand', 'Brand', '.wb-ac-nav-brand'), color('background', 'Background', 'background-color', ':self', '#080a12'), color('text-color', 'Text color', 'color', ':self', '#f8fafc')];

export const ACETERNITY_INTERACTIVE_MANIFESTS: ComponentManifest[] = [
  manifest('animated-modal', 'Animated Modal', [content('data-trigger', 'Trigger label', '[data-modal-open]'), content('data-heading', 'Dialog heading', '[role="dialog"] h2'), content('data-description', 'Dialog description', '[role="dialog"] p'), color('background', 'Section background', 'background-color', ':self', '#070812')]),
  manifest('animated-tooltip', 'Animated Tooltip', [color('background', 'Background', 'background-color', ':self', '#070812'), color('effect-primary', 'Accent', '--ac-primary', ':self', '#8b5cf6')]),
  manifest('apple-cards-carousel', 'Apple Cards Carousel', carouselProps),
  manifest('animated-testimonials', 'Animated Testimonials', carouselProps),
  manifest('carousel', 'Carousel', carouselProps),
  manifest('images-slider', 'Images Slider', carouselProps),
  manifest('tabs', 'Tabs', [color('background', 'Background', 'background-color', ':self', '#070812'), color('effect-primary', 'Active color', '--ac-primary', ':self', '#8b5cf6')]),
  manifest('floating-navbar', 'Floating Navbar', navigationProps),
  manifest('navbar-menu', 'Navbar Menu', navigationProps),
  manifest('resizable-navbar', 'Resizable Navbar', navigationProps),
  manifest('sidebar', 'Sidebar', [content('data-heading', 'Heading', 'strong'), color('background', 'Background', 'background-color', ':self', '#0b0e18')]),
  manifest('floating-dock', 'Floating Dock', [color('background', 'Background', 'background-color', ':self', '#0b0e18'), color('text-color', 'Text color', 'color', ':self', '#f8fafc')]),
  manifest('sticky-scroll-reveal', 'Sticky Scroll Reveal', [color('background', 'Background', 'background-color', ':self', '#070812'), color('effect-primary', 'Active color', '--ac-primary', ':self', '#8b5cf6')]),
  manifest('multi-step-loader', 'Multi Step Loader', [content('data-label', 'Current label', '[data-loader-current]'), attr('data-interval', 'Step interval (ms)', 'data-interval'), color('background', 'Background', 'background-color', ':self', '#0b0e18')]),
  manifest('loader', 'Loader', [content('data-label', 'Label', 'span:last-child'), color('background', 'Background', 'background-color', ':self', '#0b0e18'), color('effect-primary', 'Loader color', '--ac-primary', ':self', '#8b5cf6')]),
  manifest('link-preview', 'Link Preview', [content('data-preview-title', 'Preview title', '[role="tooltip"] strong'), content('data-preview-description', 'Preview description', '[role="tooltip"] small'), color('background', 'Background', 'background-color', ':self', '#070812')]),
];

export const ACETERNITY_INTERACTIVE_TYPES = ACETERNITY_INTERACTIVE_COMPONENT_NAMES.map(typeFor);
export function getAceternityInteractiveAsset(name: string): WebsiteComponentAsset | undefined { return ACETERNITY_INTERACTIVE_ASSETS.find(item => item.id === typeFor(name)); }
