import type { Editor } from 'grapesjs';
import type { ThemePalette } from '../types';

export function applyThemePlugin(editor: Editor, theme?: Partial<ThemePalette>) {
  const pri = theme?.primary || '#7c3aed';
  const priHover = theme?.primaryHover || '#6d28d9';
  const sec = theme?.secondary || '#f43f5e';
  const base = theme?.background || 'var(--background)';
  const surf = theme?.surface || 'var(--card)';
  const card = theme?.card || 'rgba(255,255,255,0.03)';
  const border = theme?.border || 'var(--border)';

  const cssThemeVariables = `
    :root {
      --pri: ${pri};
      --pri-hover: ${priHover};
      --sec: ${sec};
      --base: ${base};
      --surf: ${surf};
      --card: ${card};
      --border: ${border};
      --font-heading: ${theme?.fontHeading || "'Inter', sans-serif"};
      --font-body: ${theme?.fontBody || "'Inter', sans-serif"};
      --radius: ${theme?.radius || '12px'};
    }
  `;

  // Inject into canvas iframe when loaded
  editor.on('load', () => {
    const canvasDoc = editor.Canvas.getDocument();
    if (canvasDoc) {
      let themeStyleEl = canvasDoc.getElementById('gjs-theme-vars');
      if (!themeStyleEl) {
        themeStyleEl = canvasDoc.createElement('style');
        themeStyleEl.id = 'gjs-theme-vars';
        canvasDoc.head.appendChild(themeStyleEl);
      }
      themeStyleEl.innerHTML = cssThemeVariables;
    }
  });
}
