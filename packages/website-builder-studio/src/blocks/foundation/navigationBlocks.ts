import type { Editor } from 'grapesjs';

const icon = (paths: string) => `
  <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const card = (svg: string, label: string) => `
  <div class="gjs-block-custom">
    <div class="gjs-block-icon-wrapper">${svg}</div>
    <div class="gjs-block-label">${label}</div>
  </div>`;

export function registerNavigationBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  bm.add('nav-sticky', {
    label: card(icon('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'), 'Sticky Navbar'),
    category: 'Navigation',
    content: `
      <nav data-gjs-type="navigation" style="position: sticky; top: 0; z-index: 100; background: rgba(8, 9, 18, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border-subtle, var(--muted)); padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; width: 100%;">
        <div style="font-size: 20px; font-weight: 900; color: var(--foreground); letter-spacing: -0.02em;">EVENTOS</div>
        <div style="display: flex; gap: 28px; align-items: center;">
          ${['Home', 'Speakers', 'Agenda', 'Venue', 'Sponsors'].map(l => `<a href="#" style="color: var(--muted-foreground); text-decoration: none; font-size: 14px; font-weight: 500; transition: color 0.2s;">${l}</a>`).join('')}
        </div>
        <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 9px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none;">Register Now</a>
      </nav>`,
  });

  bm.add('nav-transparent', {
    label: card(icon('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/>'), 'Transparent Nav'),
    category: 'Navigation',
    content: `
      <nav data-gjs-type="navigation" style="position: absolute; top: 0; left: 0; right: 0; z-index: 100; padding: 20px 40px; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
        <div style="font-size: 20px; font-weight: 900; color: var(--foreground);">EVENTOS</div>
        <div style="display: flex; gap: 28px;">
          ${['Speakers', 'Agenda', 'Venue', 'Contact'].map(l => `<a href="#" style="color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 500;">${l}</a>`).join('')}
        </div>
        <a href="#" style="background: var(--border-default, var(--muted)); border: 1px solid var(--muted); color: var(--background); padding: 9px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; text-decoration: none; backdrop-filter: blur(8px);">Register</a>
      </nav>`,
  });

  bm.add('nav-breadcrumb', {
    label: card(icon('<polyline points="9 18 15 12 9 6"/>'), 'Breadcrumb'),
    category: 'Navigation',
    content: `
      <nav data-gjs-type="navigation" style="padding: 12px 24px; font-size: 13px; color: var(--muted-foreground); box-sizing: border-box;">
        <a href="/" style="color: var(--muted-foreground); text-decoration: none;">Home</a>
        <span style="margin: 0 8px; color: var(--foreground);">›</span>
        <a href="/speakers" style="color: var(--muted-foreground); text-decoration: none;">Speakers</a>
        <span style="margin: 0 8px; color: var(--foreground);">›</span>
        <span style="color: var(--pri, var(--primary)); font-weight: 600;">Dr. Elena Rostova</span>
      </nav>`,
  });

  bm.add('nav-page-progress', {
    label: card(icon('<line x1="3" y1="12" x2="21" y2="12"/><polyline points="15 6 21 12 15 18"/>'), 'Page Progress'),
    category: 'Navigation',
    content: `
      <div data-gjs-type="navigation" style="position: fixed; top: 0; left: 0; right: 0; z-index: 200; height: 3px; background: var(--border-subtle, var(--muted));">
        <div id="page-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, var(--pri, var(--primary)), var(--primary)); transition: width 0.1s;"></div>
      </div>`,
  });
}

export function registerUtilityBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  bm.add('util-countdown', {
    label: card(icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'), 'Countdown Timer'),
    category: 'Utilities',
    content: `
      <div data-gjs-type="navigation" style="display: flex; gap: 16px; justify-content: center; align-items: center; flex-wrap: wrap; padding: 32px; box-sizing: border-box;">
        ${[['45', 'Days'], ['12', 'Hours'], ['38', 'Minutes'], ['52', 'Seconds']].map(([n, l]) => `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; background: var(--muted); border: 1px solid var(--border); border-radius: 14px; padding: 20px 24px; min-width: 88px; text-align: center;">
            <div style="font-size: 48px; font-weight: 900; color: var(--pri, var(--primary)); line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums;">${n}</div>
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted-foreground);">${l}</div>
          </div>`).join('')}
      </div>`,
  });

  bm.add('util-map', {
    label: card(icon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'), 'Map Embed'),
    category: 'Utilities',
    content: `
      <div data-gjs-type="navigation" style="width: 100%; height: 360px; border-radius: 16px; overflow: hidden; border: 1px solid var(--border);">
        <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d100939.98555098464!2d-122.507640!3d37.757815!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x80859a6d00690021%3A0x4a501367f076adff!2sSan+Francisco%2C+CA!5e0!3m2!1sen!2sus!4v1234567890" width="100%" height="100%" style="border: 0; display: block;" allowfullscreen loading="lazy"></iframe>
      </div>`,
  });

  bm.add('util-qr-code', {
    label: card(icon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="5" y="5" width="3" height="3"/><rect x="16" y="5" width="3" height="3"/><rect x="5" y="16" width="3" height="3"/><path d="M14 14h3v3h3v3h-3v-3h-3z"/>'), 'QR Code'),
    category: 'Utilities',
    content: `
      <div data-gjs-type="navigation" style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px; text-align: center; box-sizing: border-box;">
        <div style="width: 160px; height: 160px; background: var(--foreground); border-radius: 12px; padding: 12px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;">
            <text x="50" y="60" font-size="12" fill="#000" text-anchor="middle">QR Code</text>
            <rect x="10" y="10" width="30" height="30" fill="none" stroke="var(--foreground)" stroke-width="3"/>
            <rect x="60" y="10" width="30" height="30" fill="none" stroke="var(--foreground)" stroke-width="3"/>
            <rect x="10" y="60" width="30" height="30" fill="none" stroke="var(--foreground)" stroke-width="3"/>
          </svg>
        </div>
        <p style="font-size: 13px; color: var(--muted-foreground); margin: 0;">Scan to register or visit the event website</p>
      </div>`,
  });

  bm.add('util-social-icons', {
    label: card(icon('<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>'), 'Social Icons'),
    category: 'Utilities',
    content: `
      <div data-gjs-type="navigation" style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 16px 0; box-sizing: border-box;">
        ${[
          ['Twitter/X', 'M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z'],
          ['LinkedIn', 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z M2 6.5a2 2 0 1 1 4 0 2 2 0 0 1-4 0z'],
          ['Instagram', 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37zM17.5 6.5h.01'],
        ].map(([name, path]) => `
          <a href="#" title="${name}" aria-label="${name}" style="width: 40px; height: 40px; border-radius: 10px; background: var(--border-subtle, var(--muted)); border: 1px solid var(--border-default, var(--muted)); display: flex; align-items: center; justify-content: center; color: var(--muted-foreground); text-decoration: none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px;"><path d="${path}"/></svg>
          </a>`).join('')}
      </div>`,
  });

  bm.add('util-badge', {
    label: card(icon('<rect x="1" y="8" width="22" height="8" rx="4"/>'), 'Badge'),
    category: 'Utilities',
    content: `<span data-gjs-type="navigation" style="display: inline-block; background: var(--muted); color: var(--pri, var(--primary)); padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);">New</span>`,
  });

  bm.add('util-alert', {
    label: card(icon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'), 'Alert Banner'),
    category: 'Utilities',
    content: `
      <div data-gjs-type="navigation" style="display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-radius: 10px; background: color-mix(in srgb, var(--primary) 10%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent); color: var(--foreground); font-size: 14px; box-sizing: border-box;">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--pri, var(--primary))" stroke-width="2" style="width: 18px; height: 18px; flex-shrink: 0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Early bird registration ends <strong>October 1, 2026</strong>. Register now to save 30%!</span>
      </div>`,
  });
}
