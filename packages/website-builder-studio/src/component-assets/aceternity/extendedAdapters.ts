import type { ComponentManifest, PropertyDefinition } from '../../core/properties/PropertyRegistry';
import type { WebsiteComponentAsset } from '../types';
import { ACETERNITY_CATALOG } from './catalog.generated';

export const ACETERNITY_EXTENDED_COMPONENT_NAMES = [
  '3d-card', '3d-globe', '3d-marquee', '3d-pin', 'ascii-art', 'background-ripple-effect',
  'canvas-reveal-effect', 'canvas-text', 'card-stack', 'code-block', 'comet-card', 'compare',
  'container-scroll-animation', 'container-text-flip', 'cover', 'direction-aware-hover',
  'dither-shader', 'draggable-card', 'encrypted-text', 'evervault-card', 'file-upload',
  'following-pointer', 'glare-card', 'globe', 'gooey-input', 'google-gemini-effect',
  'hero-parallax', 'images-badge', 'input', 'keyboard', 'label', 'lamp', 'layout-grid',
  'layout-text-flip', 'lens', 'macbook-scroll', 'moving-line', 'notch', 'parallax-hero-images',
  'parallax-scroll', 'parallax-scroll-2', 'pixelated-canvas', 'placeholders-and-vanish-input',
  'scales', 'svg-mask-effect', 'tailwindcss-buttons', 'terminal', 'text-flipping-board',
  'text-reveal-card', 'timeline', 'tooltip-card', 'tracing-beam', 'webcam-pixel-grid', 'world-map',
] as const;

type ExtendedName = (typeof ACETERNITY_EXTENDED_COMPONENT_NAMES)[number];
const typeFor = (name: string) => `aceternity-${name}`;
const titleFor = (name: ExtendedName) => ACETERNITY_CATALOG.find(item => item.name === name)?.title || name;
const descriptionFor = (name: ExtendedName) => ACETERNITY_CATALOG.find(item => item.name === name)?.description || 'Aceternity UI component.';

const formNames = new Set<ExtendedName>(['file-upload', 'gooey-input', 'input', 'label', 'placeholders-and-vanish-input']);
const textNames = new Set<ExtendedName>(['ascii-art', 'canvas-text', 'container-text-flip', 'encrypted-text', 'layout-text-flip', 'moving-line', 'text-flipping-board']);
const cardNames = new Set<ExtendedName>(['3d-card', '3d-pin', 'card-stack', 'comet-card', 'direction-aware-hover', 'draggable-card', 'evervault-card', 'following-pointer', 'glare-card', 'images-badge', 'lens', 'text-reveal-card', 'tooltip-card']);
const mediaNames = new Set<ExtendedName>(['3d-globe', '3d-marquee', 'compare', 'dither-shader', 'globe', 'hero-parallax', 'macbook-scroll', 'parallax-hero-images', 'parallax-scroll', 'parallax-scroll-2', 'pixelated-canvas', 'svg-mask-effect', 'webcam-pixel-grid', 'world-map']);

function visualMarkup(name: ExtendedName): string {
  const title = titleFor(name);
  return `<section data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" class="wb-ac-component wb-ac-extended wb-ac-visual wb-ac-${name}" style="position:relative;width:100%;min-height:520px;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:76px 32px;background-color:#070812;color:#f8fafc;box-sizing:border-box;">
    <div class="wb-ac-extended-effect" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="wb-ac-extended-content"><p data-gjs-type="subheading">ACETERNITY UI</p><h2 data-gjs-type="heading">${title}</h2><p data-gjs-type="paragraph">A production-safe, editable interpretation backed by the locally synced official component source.</p><a data-gjs-type="button" href="#register">Explore the experience</a></div>
  </section>`;
}

function cardMarkup(name: ExtendedName): string {
  const title = titleFor(name);
  return `<article data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" class="wb-ac-component wb-ac-extended wb-ac-extended-card wb-ac-${name}" style="position:relative;max-width:760px;min-height:380px;margin:44px auto;padding:38px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background-color:#0d101a;color:#f8fafc;overflow:hidden;box-sizing:border-box;">
    <div class="wb-ac-extended-card-glow" aria-hidden="true"></div><div class="wb-ac-extended-content"><p data-gjs-type="subheading">FEATURED</p><h2 data-gjs-type="heading">${title}</h2><p data-gjs-type="paragraph">Select this card or any nested text and action to edit its own settings.</p><a data-gjs-type="button" href="#details">View details</a></div>
  </article>`;
}

function textMarkup(name: ExtendedName): string {
  const title = titleFor(name);
  return `<div data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" class="wb-ac-component wb-ac-extended wb-ac-extended-text wb-ac-${name}" style="max-width:1080px;margin:48px auto;padding:38px;background-color:#070812;color:#f8fafc;box-sizing:border-box;"><p data-gjs-type="subheading">DISPLAY TEXT</p><h2 data-gjs-type="heading">${title} gives the message a deliberate rhythm.</h2><p data-gjs-type="paragraph">Edit the copy, typography, colors, spacing, and responsive behavior from the inspector.</p></div>`;
}

function formMarkup(name: ExtendedName): string {
  const title = titleFor(name);
  const file = name === 'file-upload' ? ' type="file"' : ' type="text"';
  return `<form data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" class="wb-ac-component wb-ac-extended wb-ac-extended-form wb-ac-${name}" style="max-width:720px;margin:44px auto;padding:34px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background-color:#0b0e18;color:#f8fafc;box-sizing:border-box;" action="#" method="post"><h2 data-gjs-type="heading">${title}</h2><p data-gjs-type="paragraph">A clear, accessible field treatment for event forms.</p><label data-gjs-type="label" for="${name}-field">Your details</label><input data-gjs-type="input" id="${name}-field" name="details"${file} placeholder="Enter your information"><button data-gjs-type="button" type="submit">Continue</button></form>`;
}

function utilityMarkup(name: ExtendedName): string {
  const title = titleFor(name);
  return `<section data-gjs-type="${typeFor(name)}" data-aceternity-name="${name}" class="wb-ac-component wb-ac-extended wb-ac-extended-utility wb-ac-${name}" style="width:100%;padding:72px 32px;background-color:#070812;color:#f8fafc;box-sizing:border-box;"><div class="wb-ac-extended-content"><p data-gjs-type="subheading">INTERACTIVE DETAIL</p><h2 data-gjs-type="heading">${title}</h2><p data-gjs-type="paragraph">A deterministic builder adapter with the official source retained in the component asset catalog.</p><div class="wb-ac-extended-demo" aria-hidden="true"><span></span><span></span><span></span></div></div></section>`;
}

function markupFor(name: ExtendedName): string {
  if (formNames.has(name)) return formMarkup(name);
  if (textNames.has(name)) return textMarkup(name);
  if (cardNames.has(name)) return cardMarkup(name);
  if (mediaNames.has(name)) return visualMarkup(name);
  return utilityMarkup(name);
}

export const ACETERNITY_EXTENDED_ASSETS: WebsiteComponentAsset[] = ACETERNITY_EXTENDED_COMPONENT_NAMES.map(name => ({
  id: typeFor(name),
  name: titleFor(name),
  kind: 'component',
  group: 'Aceternity',
  description: descriptionFor(name),
  tags: ['aceternity', name, formNames.has(name) ? 'form' : textNames.has(name) ? 'text' : cardNames.has(name) ? 'card' : mediaNames.has(name) ? 'media' : 'effect'],
  preview: { accent: '#8b5cf6', background: '#070812', title: titleFor(name), subtitle: 'Official source + EVENTOS adapter' },
  html: markupFor(name),
  json: { components: [] },
}));

const content = (id: string, label: string, selector: string): PropertyDefinition => ({ id, type: 'Text', label, target: { kind: 'content', selector } });
const color = (id: string, label: string, css: string, selector: string, defaultValue: string): PropertyDefinition => ({ id, type: 'Color', label, defaultValue, target: { kind: 'style', css, selector } });
const attribute = (id: string, label: string, name: string, selector?: string): PropertyDefinition => ({ id, type: 'Text', label, target: { kind: 'attribute', name, selector } });

function propertiesFor(name: ExtendedName): PropertyDefinition[] {
  const common = [
    content('data-heading', 'Heading', 'h1,h2,h3'),
    content('data-description', 'Description', 'p:last-of-type'),
    color('background', 'Background', 'background-color', ':self', '#070812'),
    color('heading-color', 'Heading color', 'color', 'h1,h2,h3', '#f8fafc'),
    color('accent', 'Accent color', '--ac-primary', ':self', '#8b5cf6'),
  ];
  if (formNames.has(name)) return [
    ...common,
    attribute('data-label', 'Field label', 'placeholder', 'input'),
    attribute('data-name', 'Field name', 'name', 'input'),
    content('data-button', 'Button label', 'button'),
  ];
  if (cardNames.has(name) || mediaNames.has(name)) return [
    ...common,
    content('data-action-label', 'Action label', 'a'),
    attribute('data-action-link', 'Action link', 'href', 'a'),
  ];
  return common;
}

export const ACETERNITY_EXTENDED_MANIFESTS: ComponentManifest[] = ACETERNITY_EXTENDED_COMPONENT_NAMES.map(name => ({
  id: typeFor(name),
  title: titleFor(name),
  category: 'Aceternity',
  description: 'Source-backed EVENTOS adapter for the official Aceternity UI component.',
  tags: ['aceternity', name],
  supportsTheme: true,
  supportsAnimation: true,
  supportsResponsive: true,
  defaults: { 'data-aceternity-name': name },
  schema: { groups: [{ groupId: 'CONTENT', properties: propertiesFor(name) }] },
}));

export const ACETERNITY_EXTENDED_TYPES = ACETERNITY_EXTENDED_COMPONENT_NAMES.map(typeFor);

export function getAceternityExtendedAsset(name: string): WebsiteComponentAsset | undefined {
  return ACETERNITY_EXTENDED_ASSETS.find(asset => asset.id === typeFor(name));
}
