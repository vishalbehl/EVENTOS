import type { Editor } from 'grapesjs';

const icon = (paths: string) => `
  <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    ${paths}
  </svg>`;
const card = (svg: string, label: string) => `
  <div class="gjs-block-custom">
    <div class="gjs-block-icon-wrapper">${svg}</div>
    <div class="gjs-block-label">${label}</div>
  </div>`;

export function registerButtonBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  bm.add('btn-primary', {
    label: card(icon('<rect x="2" y="6" width="20" height="12" rx="3"/>'), 'Primary Button'),
    category: 'Buttons',
    content: `<a data-gjs-type="button" href="#" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--pri, var(--primary)); color: var(--foreground); padding: 14px 32px; border-radius: 10px; font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 8px 20px color-mix(in srgb, var(--primary) 35%, transparent);">Register Now</a>`,
    attributes: { title: 'Primary action button' },
  });

  bm.add('btn-secondary', {
    label: card(icon('<rect x="2" y="6" width="20" height="12" rx="3"/><rect x="4" y="8" width="16" height="8" rx="2" fill="none"/>'), 'Secondary Btn'),
    category: 'Buttons',
    content: `<a data-gjs-type="button" href="#" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--border-subtle, var(--muted)); color: var(--foreground); padding: 14px 32px; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none; border: 1px solid var(--border-strong, var(--muted)); cursor: pointer; transition: all 0.2s; backdrop-filter: blur(8px);">Learn More</a>`,
  });

  bm.add('btn-cta', {
    label: card(icon('<rect x="1" y="4" width="22" height="16" rx="3"/><path d="M16 12H8M13 9l3 3-3 3"/>'), 'CTA Button'),
    category: 'Buttons',
    content: `
      <div data-gjs-type="button" style="display: inline-flex; align-items: center; gap: 12px; background: linear-gradient(135deg, var(--pri, var(--primary)), var(--primary)); padding: 16px 36px; border-radius: 12px; text-decoration: none; box-shadow: 0 12px 28px var(--muted); cursor: pointer;">
        <div>
          <div style="font-size: 16px; font-weight: 800; color: var(--foreground);">Register Now</div>
          <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Early bird closes soon</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--background)" stroke-width="2.5" style="width: 20px; height: 20px; flex-shrink: 0;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </div>`,
  });

  bm.add('btn-download', {
    label: card(icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'), 'Download Btn'),
    category: 'Buttons',
    content: `
      <a data-gjs-type="button" href="#" style="display: inline-flex; align-items: center; gap: 10px; background: color-mix(in srgb, var(--primary) 15%, transparent); color: var(--pri, var(--primary)); padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); cursor: pointer;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download Brochure (PDF)
      </a>`,
  });

  bm.add('btn-icon', {
    label: card(icon('<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>'), 'Icon Button'),
    category: 'Buttons',
    content: `<button data-gjs-type="button" style="width: 44px; height: 44px; border-radius: 50%; background: color-mix(in srgb, var(--primary) 15%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); color: var(--pri, var(--primary)); display: inline-flex; align-items: center; justify-content: center; cursor: pointer;" aria-label="Action">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px;"><path d="M12 8v8M8 12h8"/></svg>
    </button>`,
  });

  bm.add('btn-group', {
    label: card(icon('<rect x="2" y="7" width="8" height="10" rx="2"/><rect x="14" y="7" width="8" height="10" rx="2"/>'), 'Button Group'),
    category: 'Buttons',
    content: `
      <div data-gjs-type="button" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
        <a href="#" style="display: inline-flex; align-items: center; background: var(--pri, var(--primary)); color: var(--background); padding: 13px 28px; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 14px;">Primary Action</a>
        <a href="#" style="display: inline-flex; align-items: center; background: var(--border-subtle, var(--muted)); color: var(--foreground); border: 1px solid var(--border-strong, var(--muted)); padding: 13px 28px; border-radius: 10px; font-weight: 600; text-decoration: none; font-size: 14px;">Secondary</a>
      </div>`,
  });
}
