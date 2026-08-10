import type { Editor } from 'grapesjs';

export function registerComponentTypes(editor: Editor) {
  const dc = editor.DomComponents;

  const types = [
    'section',
    'container',
    'grid',
    'card',
    'spacer',
    'divider',
    'accordion',
    'tabs',
    'heading',
    'paragraph',
    'image',
    'image-text',
    'hero',
    'speaker-grid',
    'sponsor-grid',
    'agenda',
    'gallery',
    'button',
    'contact-form',
    'countdown',
    'committee',
    'venue',
    'statistics',
    'navigation',
    'footer'
  ];

  types.forEach(type => {
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
          if (type === 'button' && (tag === 'button' || (tag === 'a' && el.classList.contains('button')))) return true;
          if (type === 'image' && tag === 'img') return true;
        }

        return false;
      },
      model: {
        defaults: {
          type: type,
        }
      }
    });
  });
}
