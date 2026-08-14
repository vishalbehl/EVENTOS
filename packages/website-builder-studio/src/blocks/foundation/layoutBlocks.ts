import type { Editor } from 'grapesjs';

// ── SVG icon helper ───────────────────────────────────────────────────────
const icon = (paths: string) => `
  <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    ${paths}
  </svg>`;

const card = (svg: string, label: string) => `
  <div class="gjs-block-custom">
    <div class="gjs-block-icon-wrapper">${svg}</div>
    <div class="gjs-block-label">${label}</div>
  </div>`;

// ── Layout Foundation Blocks ──────────────────────────────────────────────
export function registerLayoutBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  // 1 Column Section
  bm.add('layout-section', {
    label: card(icon('<rect x="3" y="3" width="18" height="18" rx="2"/>'), 'Section'),
    category: 'Layout',
    content: {
      tagName: 'section',
      attributes: { class: 'ev-section', 'data-gjs-type': 'section' },
      style: { padding: '60px 24px', width: '100%', boxSizing: 'border-box', minHeight: '120px' },
      components: [{ tagName: 'div', attributes: { class: 'ev-container' }, style: { maxWidth: '1100px', margin: '0 auto' } }],
    },
  });

  bm.add('layout-1col', {
    label: card(icon('<rect x="3" y="3" width="18" height="18" rx="2"/>'), '1 Column'),
    category: 'Layout',
    content: `<div data-gjs-type="container" style="padding: 20px; min-height: 80px; box-sizing: border-box;"></div>`,
  });

  bm.add('layout-2col', {
    label: card(icon('<rect x="3" y="3" width="8" height="18" rx="2"/><rect x="13" y="3" width="8" height="18" rx="2"/>'), '2 Columns'),
    category: 'Layout',
    content: `
      <div data-gjs-type="container" style="display: flex; gap: 24px; flex-wrap: wrap; padding: 20px; box-sizing: border-box;">
        <div style="flex: 1; min-width: 280px; min-height: 80px; padding: 16px; border: 1px dashed var(--muted); border-radius: 8px;"></div>
        <div style="flex: 1; min-width: 280px; min-height: 80px; padding: 16px; border: 1px dashed var(--muted); border-radius: 8px;"></div>
      </div>`,
  });

  bm.add('layout-3col', {
    label: card(icon('<rect x="2" y="3" width="5" height="18" rx="1"/><rect x="9.5" y="3" width="5" height="18" rx="1"/><rect x="17" y="3" width="5" height="18" rx="1"/>'), '3 Columns'),
    category: 'Layout',
    content: `
      <div data-gjs-type="container" style="display: flex; gap: 24px; flex-wrap: wrap; padding: 20px; box-sizing: border-box;">
        <div style="flex: 1; min-width: 220px; min-height: 80px; padding: 16px; border: 1px dashed var(--muted); border-radius: 8px;"></div>
        <div style="flex: 1; min-width: 220px; min-height: 80px; padding: 16px; border: 1px dashed var(--muted); border-radius: 8px;"></div>
        <div style="flex: 1; min-width: 220px; min-height: 80px; padding: 16px; border: 1px dashed var(--muted); border-radius: 8px;"></div>
      </div>`,
  });

  bm.add('layout-2col-37', {
    label: card(icon('<rect x="2" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="9" height="18" rx="1"/>'), '2 Col 3/7'),
    category: 'Layout',
    content: `
      <div data-gjs-type="container" style="display: flex; gap: 24px; flex-wrap: wrap; padding: 20px; box-sizing: border-box;">
        <div style="flex: 3; min-width: 220px; min-height: 80px; padding: 16px; border: 1px dashed var(--muted); border-radius: 8px;"></div>
        <div style="flex: 7; min-width: 280px; min-height: 80px; padding: 16px; border: 1px dashed var(--muted); border-radius: 8px;"></div>
      </div>`,
  });

  bm.add('layout-4col', {
    label: card(icon('<rect x="2" y="3" width="3.5" height="18" rx="1"/><rect x="7" y="3" width="3.5" height="18" rx="1"/><rect x="12" y="3" width="3.5" height="18" rx="1"/><rect x="17" y="3" width="3.5" height="18" rx="1"/>'), '4 Columns'),
    category: 'Layout',
    content: `
      <div data-gjs-type="container" style="display: flex; gap: 20px; flex-wrap: wrap; padding: 20px; box-sizing: border-box;">
        ${Array(4).fill(`<div style="flex: 1; min-width: 180px; min-height: 80px; padding: 12px; border: 1px dashed var(--muted); border-radius: 8px;"></div>`).join('')}
      </div>`,
  });

  bm.add('layout-grid', {
    label: card(icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'), 'Grid'),
    category: 'Layout',
    content: `
      <div data-gjs-type="container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; padding: 20px; box-sizing: border-box;">
        ${Array(4).fill(`<div style="min-height: 100px; padding: 16px; border: 1px dashed var(--muted); border-radius: 8px;"></div>`).join('')}
      </div>`,
  });

  bm.add('layout-card', {
    label: card(icon('<rect x="2" y="4" width="20" height="16" rx="3"/><line x1="2" y1="9" x2="22" y2="9"/>'), 'Card'),
    category: 'Layout',
    content: `
      <div data-gjs-type="card" style="background: var(--muted); border: 1px solid var(--border); border-radius: 16px; padding: 24px; box-sizing: border-box; min-height: 120px;"></div>`,
  });

  bm.add('layout-spacer', {
    label: card(icon('<line x1="12" y1="4" x2="12" y2="20"/><polyline points="8 8 12 4 16 8"/><polyline points="8 16 12 20 16 16"/>'), 'Spacer'),
    category: 'Layout',
    content: `<div data-gjs-type="spacer" style="height: 60px; width: 100%; flex-shrink: 0;"></div>`,
  });

  bm.add('layout-divider', {
    label: card(icon('<line x1="3" y1="12" x2="21" y2="12"/>'), 'Divider'),
    category: 'Layout',
    content: `<hr data-gjs-type="divider" style="border: none; border-top: 1px solid var(--border); margin: 0; width: 100%;" />`,
  });

  bm.add('layout-accordion', {
    label: card(icon('<rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/>'), 'Accordion'),
    category: 'Layout',
    content: `
      <div data-gjs-type="accordion" style="display: flex; flex-direction: column; gap: 8px; width: 100%; box-sizing: border-box;">
        ${[1, 2, 3].map(i => `
          <details style="background: var(--muted); border: 1px solid var(--border); border-radius: 10px; overflow: hidden;">
            <summary style="padding: 14px 18px; font-weight: 600; font-size: 15px; cursor: pointer; color: var(--foreground); list-style: none;">Accordion Item ${i}</summary>
            <div style="padding: 0 18px 16px; color: var(--muted-foreground); font-size: 14px; line-height: 1.6;">Content for item ${i} goes here.</div>
          </details>`).join('')}
      </div>`,
  });

  bm.add('layout-divider-wave', {
    label: card(icon('<path d="M3 12 Q6 6 9 12 Q12 18 15 12 Q18 6 21 12"/>'), 'Wave Divider'),
    category: 'Layout',
    content: `
      <div data-gjs-type="divider" style="width: 100%; overflow: hidden; line-height: 0; margin-bottom: -1px;">
        <svg viewBox="0 0 1440 60" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style="display: block; width: 100%; height: 60px;">
          <path d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z" fill="var(--bg-surface-hover, var(--muted))"/>
        </svg>
      </div>`,
  });
}
