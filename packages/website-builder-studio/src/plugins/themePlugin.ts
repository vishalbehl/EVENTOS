import type { Editor } from 'grapesjs';
import type { ThemePalette } from '../types';

export function buildThemeCss(theme?: Partial<ThemePalette>) {
  const pri = theme?.primary || '#7c3aed';
  const priHover = theme?.primaryHover || '#6d28d9';
  const sec = theme?.secondary || '#f43f5e';
  const base = theme?.background || '#080912';
  const surf = theme?.surface || '#0b1017';
  const card = theme?.card || 'rgba(255,255,255,0.03)';
  const border = theme?.border || 'rgba(148,163,184,0.18)';
  const foreground = '#f8fafc';
  const muted = '#1f2937';
  const mutedForeground = '#94a3b8';

  return `
    :root,
    body {
      --pri: ${pri};
      --pri-hover: ${priHover};
      --sec: ${sec};
      --base: ${base};
      --surf: ${surf};
      --card: ${card};
      --border: ${border};
      --primary: ${pri};
      --primary-hover: ${priHover};
      --secondary: ${sec};
      --background: ${base};
      --surface: ${surf};
      --foreground: ${foreground};
      --muted: ${muted};
      --muted-foreground: ${mutedForeground};
      --border-subtle: rgba(148,163,184,0.12);
      --border-default: rgba(148,163,184,0.18);
      --border-strong: rgba(148,163,184,0.32);
      --text-secondary: ${mutedForeground};
      --success: #22c55e;
      --font-heading: ${theme?.fontHeading || "'Inter', sans-serif"};
      --font-body: ${theme?.fontBody || "'Inter', sans-serif"};
      --radius: ${theme?.radius || '12px'};
    }
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }
    html,
    body {
      margin: 0;
      width: 100%;
      min-height: 100%;
      background: var(--background) !important;
      color: var(--foreground) !important;
      font-family: var(--font-body) !important;
      overflow-x: hidden;
    }
    body {
      min-height: 100vh;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: var(--font-heading);
    }
    img,
    video,
    svg {
      max-width: 100%;
    }
    a {
      color: inherit;
    }
  `;
}

export function applyThemePlugin(editor: Editor, theme?: Partial<ThemePalette>) {
  const injectTheme = () => {
    const canvas = editor.Canvas;
    if (!canvas) return;

    const canvasDoc = canvas.getDocument?.();
    if (canvasDoc) {
      let themeStyleEl = canvasDoc.getElementById('gjs-theme-vars');
      if (!themeStyleEl) {
        themeStyleEl = canvasDoc.createElement('style');
        themeStyleEl.id = 'gjs-theme-vars';
        canvasDoc.head.appendChild(themeStyleEl);
      }
      themeStyleEl.innerHTML = buildThemeCss(theme);
      canvasDoc.documentElement.style.background = theme?.background || '#080912';
      canvasDoc.documentElement.style.minHeight = '100%';
      canvasDoc.body.style.background = theme?.background || '#080912';
      canvasDoc.body.style.color = '#f8fafc';
      canvasDoc.body.style.minHeight = '100vh';
      canvasDoc.body.style.margin = '0';
    }
    const frameEl = canvas.getFrameEl?.();
    if (frameEl) {
      frameEl.style.background = theme?.background || '#080912';
      frameEl.style.colorScheme = 'dark';
    }
  };

  injectTheme();
  editor.on('load', injectTheme);
  editor.on('canvas:frame:load', injectTheme);
  return injectTheme;
}
