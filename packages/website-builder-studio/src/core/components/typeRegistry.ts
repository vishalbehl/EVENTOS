import type { Editor } from 'grapesjs';
import { ACETERNITY_BUILDER_TYPES } from '../../component-assets/aceternity/adapters';

export const BUILDER_COMPONENT_TYPES = [
  'section', 'container', 'grid', 'card', 'spacer', 'divider', 'accordion', 'tabs',
  'heading', 'subheading', 'paragraph', 'lead-text', 'highlight', 'counter', 'blockquote', 'marquee',
  'image', 'image-text', 'video', 'logo-marquee', 'icon-block',
  'hero', 'event-overview', 'organizer-message', 'speaker-grid', 'featured-speaker', 'sponsor-grid',
  'pricing', 'agenda', 'gallery', 'button', 'button-group', 'contact-form', 'newsletter',
  'sponsor-inquiry', 'contact-footer', 'registration-cta', 'countdown', 'committee', 'venue',
  'statistics', 'header', 'navigation', 'footer', 'breadcrumb', 'progress-bar', 'map', 'qr-code',
  'social-icons', 'social-icon', 'badge', 'alert', ...ACETERNITY_BUILDER_TYPES,
] as const;

export function registerComponentTypes(editor: Editor) {
  const dc = editor.DomComponents;

  BUILDER_COMPONENT_TYPES.forEach(type => {
    dc.addType(type, {
      isComponent: el => {
        if (!el || !el.getAttribute) return false;
        
        // 1. Explicit data-gjs-type match
        if (el.getAttribute('data-gjs-type') === type) return true;

        // 2. Auto-detection for basic types if no explicit type is set
        const explicitType = el.getAttribute('data-gjs-type');
        if (!explicitType) {
          const tag = el.tagName ? el.tagName.toLowerCase() : '';
          
          if (type === 'heading' && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return true;
          if (type === 'paragraph' && tag === 'p') return true;
          if (type === 'button' && (tag === 'button' || tag === 'a')) return true;
          if (type === 'image' && tag === 'img') return true;
          if (type === 'footer' && tag === 'footer') return true;
          if (type === 'contact-form' && tag === 'form') return true;
          if (type === 'countdown' && el.getAttribute('data-countdown')) return true;
          if (type === 'navigation' && tag === 'nav') return true;
        }

        return false;
      },
      model: {
        defaults: {
          type: type,
          selectable: true,
          hoverable: true,
          editable: true,
        }
      }
    });
  });
}
