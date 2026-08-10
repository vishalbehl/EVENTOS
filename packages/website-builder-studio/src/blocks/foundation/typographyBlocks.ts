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

export function registerTypographyBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  bm.add('typo-heading', {
    label: card(icon('<path d="M4 6h16M4 12h16M4 18h7"/>'), 'Heading'),
    category: 'Typography',
    content: `<h2 data-gjs-type="heading" style="font-size: 42px; font-weight: 800; line-height: 1.15; color: var(--foreground); margin: 0 0 16px 0; letter-spacing: -0.02em;">Section Heading</h2>`,
  });

  bm.add('typo-subheading', {
    label: card(icon('<path d="M4 6h16M4 12h12"/>'), 'Subheading'),
    category: 'Typography',
    content: `<h3 data-gjs-type="heading" style="font-size: 28px; font-weight: 700; line-height: 1.3; color: var(--foreground); margin: 0 0 12px 0;">Subheading Text</h3>`,
  });

  bm.add('typo-paragraph', {
    label: card(icon('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/>'), 'Paragraph'),
    category: 'Typography',
    content: `<p data-gjs-type="heading" style="font-size: 16px; line-height: 1.75; color: var(--muted-foreground); margin: 0 0 16px 0; max-width: 680px;">Your paragraph text goes here. Describe your event, section, or content with clear, engaging copy that speaks directly to your attendees.</p>`,
  });

  bm.add('typo-lead', {
    label: card(icon('<line x1="3" y1="5" x2="21" y2="5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="14" y2="15"/>'), 'Lead Text'),
    category: 'Typography',
    content: `<p data-gjs-type="heading" style="font-size: 20px; line-height: 1.65; color: var(--foreground); font-weight: 400; margin: 0 0 20px 0; max-width: 780px;">This is a lead paragraph. Use it to introduce a section with a slightly larger, more prominent text style than body copy.</p>`,
  });

  bm.add('typo-eyebrow', {
    label: card(icon('<line x1="4" y1="12" x2="20" y2="12"/>'), 'Eyebrow Label'),
    category: 'Typography',
    content: `<p data-gjs-type="heading" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">Category Label</p>`,
  });

  bm.add('typo-blockquote', {
    label: card(icon('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>'), 'Blockquote'),
    category: 'Typography',
    content: `
      <blockquote data-gjs-type="heading" style="border-left: 4px solid var(--pri, var(--primary)); padding: 16px 24px; margin: 0 0 24px 0; background: var(--muted); border-radius: 0 12px 12px 0;">
        <p style="font-size: 18px; font-style: italic; color: var(--foreground); line-height: 1.7; margin: 0 0 12px 0;">"An inspiring quote about the conference, speaker thought, or event mission statement goes here."</p>
        <cite style="font-size: 14px; font-weight: 600; color: var(--pri, var(--primary)); font-style: normal;">— Speaker Name, Role</cite>
      </blockquote>`,
  });

  bm.add('typo-counter', {
    label: card(icon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'), 'Number Counter'),
    category: 'Typography',
    content: `
      <div data-gjs-type="heading" style="text-align: center; padding: 24px;">
        <div style="font-size: 64px; font-weight: 900; color: var(--pri, var(--primary)); line-height: 1; letter-spacing: -0.03em;">1,200+</div>
        <div style="font-size: 16px; font-weight: 500; color: var(--muted-foreground); margin-top: 8px; text-transform: uppercase; letter-spacing: 0.08em;">Attending Delegates</div>
      </div>`,
  });

  bm.add('typo-highlight', {
    label: card(icon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'), 'Highlight Text'),
    category: 'Typography',
    content: `<p data-gjs-type="heading" style="font-size: 16px; line-height: 1.7; color: var(--foreground); margin: 0;">This text contains a <mark style="background: linear-gradient(120deg, color-mix(in srgb, var(--primary) 30%, transparent) 0%, color-mix(in srgb, var(--primary) 15%, transparent) 100%); padding: 2px 6px; border-radius: 4px; color: var(--pri, var(--primary)); font-weight: 600;">highlighted phrase</mark> to draw attention to key content.</p>`,
  });

  bm.add('typo-code', {
    label: card(icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'), 'Code Block'),
    category: 'Typography',
    content: `<pre data-gjs-type="heading" style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; overflow-x: auto; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; color: var(--foreground); line-height: 1.6; margin: 0;"><code>// Sample code block
const eventData = {
  name: 'Global Tech Summit 2026',
  date: '2026-10-24',
};</code></pre>`,
  });

  bm.add('typo-marquee', {
    label: card(icon('<path d="M5 12h14M12 5l7 7-7 7"/>'), 'Marquee Text'),
    category: 'Typography',
    content: `
      <div data-gjs-type="heading" style="overflow: hidden; white-space: nowrap; padding: 12px 0; background: var(--muted); border-top: 1px solid var(--border-subtle, var(--muted)); border-bottom: 1px solid var(--border-subtle, var(--muted));">
        <span style="display: inline-block; animation: marquee 20s linear infinite; font-size: 24px; font-weight: 700; color: var(--muted); letter-spacing: 0.1em;">
          GLOBAL CONFERENCE &nbsp;&nbsp;•&nbsp;&nbsp; INNOVATION &nbsp;&nbsp;•&nbsp;&nbsp; TECHNOLOGY &nbsp;&nbsp;•&nbsp;&nbsp; RESEARCH &nbsp;&nbsp;•&nbsp;&nbsp; NETWORKING &nbsp;&nbsp;•&nbsp;&nbsp; KNOWLEDGE &nbsp;&nbsp;•&nbsp;&nbsp;
        </span>
      </div>`,
  });
}
