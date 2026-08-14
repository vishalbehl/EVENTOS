import type { Editor } from 'grapesjs';

const icon = (paths: string) => `
  <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const card = (svg: string, label: string) => `
  <div class="gjs-block-custom">
    <div class="gjs-block-icon-wrapper">${svg}</div>
    <div class="gjs-block-label">${label}</div>
  </div>`;

const logoMark = `
  <span data-role="logo-mark" style="width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--pri,var(--primary)),var(--sec,var(--secondary)));display:inline-flex;align-items:center;justify-content:center;color:white;font-weight:900;line-height:1;">E</span>`;

export function registerHeaderBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  bm.add('header-event-simple', {
    label: card(icon('<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="10" x2="17" y2="10"/><line x1="7" y1="14" x2="13" y2="14"/>'), 'Header Simple'),
    category: 'Headers',
    content: `
      <header data-gjs-type="header" data-logo-text="EVENTOS" data-cta-text="Register" style="width:100%;background:var(--surface);border-bottom:1px solid var(--border-subtle);color:var(--foreground);box-sizing:border-box;">
        <div style="max-width:1180px;margin:0 auto;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:24px;box-sizing:border-box;">
          <a href="/" data-role="logo" style="display:inline-flex;align-items:center;gap:10px;color:var(--foreground);text-decoration:none;font-weight:900;font-size:18px;letter-spacing:0;">
            ${logoMark}
            <span data-role="logo-text">EVENTOS</span>
          </a>
          <nav data-role="menu" style="display:flex;align-items:center;gap:26px;flex-wrap:wrap;">
            ${['Home', 'About', 'Speakers', 'Agenda', 'Contact'].map(label => `<a data-gjs-type="button" href="#${label.toLowerCase()}" style="color:var(--muted-foreground);text-decoration:none;font-size:14px;font-weight:650;">${label}</a>`).join('')}
          </nav>
          <a data-gjs-type="button" data-role="cta" href="#register" style="display:inline-flex;align-items:center;justify-content:center;background:var(--pri,var(--primary));color:white;text-decoration:none;border-radius:9px;padding:10px 18px;font-size:13px;font-weight:800;">Register</a>
        </div>
      </header>`,
  });

  bm.add('header-glass-sticky', {
    label: card(icon('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 8h4M14 8h3M7 12h10M7 16h6"/>'), 'Header Glass'),
    category: 'Headers',
    content: `
      <header data-gjs-type="header" data-logo-text="TECH SUMMIT" data-cta-text="Get Tickets" style="position:sticky;top:0;z-index:80;width:100%;background:color-mix(in srgb,var(--surface) 84%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid var(--border-subtle);color:var(--foreground);box-sizing:border-box;">
        <div style="max-width:1240px;margin:0 auto;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:22px;box-sizing:border-box;">
          <a href="/" data-role="logo" style="display:inline-flex;align-items:center;gap:11px;color:var(--foreground);text-decoration:none;font-weight:900;font-size:17px;">
            ${logoMark}
            <span data-role="logo-text">TECH SUMMIT</span>
          </a>
          <nav data-role="menu" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${['Overview', 'Speakers', 'Schedule', 'Sponsors'].map(label => `<a data-gjs-type="button" href="#${label.toLowerCase()}" style="color:var(--muted-foreground);text-decoration:none;font-size:13px;font-weight:700;padding:8px 10px;border-radius:8px;">${label}</a>`).join('')}
          </nav>
          <div style="display:flex;align-items:center;gap:10px;">
            <a data-gjs-type="button" href="#agenda" style="color:var(--foreground);text-decoration:none;border:1px solid var(--border-default);border-radius:9px;padding:9px 14px;font-size:13px;font-weight:750;">Agenda</a>
            <a data-gjs-type="button" data-role="cta" href="#tickets" style="display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--pri,var(--primary)),var(--pri-hover,var(--primary-hover)));color:white;text-decoration:none;border-radius:9px;padding:10px 18px;font-size:13px;font-weight:850;box-shadow:0 10px 24px color-mix(in srgb,var(--primary) 28%,transparent);">Get Tickets</a>
          </div>
        </div>
      </header>`,
  });

  bm.add('header-logo-centered', {
    label: card(icon('<path d="M12 4l7 4v8l-7 4-7-4V8z"/><line x1="3" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="21" y2="12"/>'), 'Header Center Logo'),
    category: 'Headers',
    content: `
      <header data-gjs-type="header" data-logo-text="EVENTOS" data-cta-text="Sponsor Us" style="width:100%;background:var(--background);border-bottom:1px solid var(--border-subtle);color:var(--foreground);box-sizing:border-box;">
        <div style="max-width:1160px;margin:0 auto;padding:16px 24px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;box-sizing:border-box;">
          <nav data-role="menu-left" style="display:flex;align-items:center;gap:22px;flex-wrap:wrap;">
            ${['About', 'Speakers', 'Agenda'].map(label => `<a data-gjs-type="button" href="#${label.toLowerCase()}" style="color:var(--muted-foreground);text-decoration:none;font-size:13px;font-weight:700;">${label}</a>`).join('')}
          </nav>
          <a href="/" data-role="logo" style="display:inline-flex;align-items:center;gap:10px;color:var(--foreground);text-decoration:none;font-weight:950;font-size:18px;">
            ${logoMark}
            <span data-role="logo-text">EVENTOS</span>
          </a>
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:22px;">
            <a data-gjs-type="button" href="#venue" style="color:var(--muted-foreground);text-decoration:none;font-size:13px;font-weight:700;">Venue</a>
            <a data-gjs-type="button" data-role="cta" href="#sponsors" style="display:inline-flex;align-items:center;justify-content:center;background:var(--foreground);color:var(--background);text-decoration:none;border-radius:999px;padding:10px 17px;font-size:13px;font-weight:850;">Sponsor Us</a>
          </div>
        </div>
      </header>`,
  });

  bm.add('header-event-banner', {
    label: card(icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 14h8"/>'), 'Header + Banner'),
    category: 'Headers',
    content: `
      <header data-gjs-type="header" data-logo-text="EVENTOS CONF" data-cta-text="Register Now" style="width:100%;background:var(--surface);color:var(--foreground);box-sizing:border-box;">
        <div style="background:linear-gradient(90deg,var(--pri,var(--primary)),var(--sec,var(--secondary)));color:white;text-align:center;padding:8px 16px;font-size:12px;font-weight:800;letter-spacing:0;">Early bird tickets close soon</div>
        <div style="max-width:1200px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;gap:24px;box-sizing:border-box;border-bottom:1px solid var(--border-subtle);">
          <a href="/" data-role="logo" style="display:inline-flex;align-items:center;gap:10px;color:var(--foreground);text-decoration:none;font-weight:900;font-size:18px;">
            ${logoMark}
            <span data-role="logo-text">EVENTOS CONF</span>
          </a>
          <nav data-role="menu" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
            ${['Program', 'Tickets', 'Venue', 'FAQ'].map(label => `<a data-gjs-type="button" href="#${label.toLowerCase()}" style="color:var(--muted-foreground);text-decoration:none;font-size:14px;font-weight:700;">${label}</a>`).join('')}
          </nav>
          <a data-gjs-type="button" data-role="cta" href="#register" style="display:inline-flex;align-items:center;justify-content:center;background:var(--pri,var(--primary));color:white;text-decoration:none;border-radius:9px;padding:10px 18px;font-size:13px;font-weight:850;">Register Now</a>
        </div>
      </header>`,
  });
}

export function registerNavigationBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  bm.add('nav-sticky', {
    label: card(icon('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'), 'Sticky Navbar'),
    category: 'Navigation',
    content: `
      <nav data-gjs-type="navigation" style="position: sticky; top: 0; z-index: 100; background: rgba(8, 9, 18, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border-subtle, var(--muted)); padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; width: 100%;">
        <div data-gjs-type="heading" style="font-size: 20px; font-weight: 900; color: var(--foreground); letter-spacing: -0.02em;">EVENTOS</div>
        <div data-gjs-type="button-group" style="display: flex; gap: 28px; align-items: center;">
          ${['Home', 'Speakers', 'Agenda', 'Venue', 'Sponsors'].map(l => `<a data-gjs-type="button" href="#" style="color: var(--muted-foreground); text-decoration: none; font-size: 14px; font-weight: 500; transition: color 0.2s;">${l}</a>`).join('')}
        </div>
        <a data-gjs-type="button" href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 9px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none;">Register Now</a>
      </nav>`,
  });

  bm.add('nav-transparent', {
    label: card(icon('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/>'), 'Transparent Nav'),
    category: 'Navigation',
    content: `
      <nav data-gjs-type="navigation" style="position: absolute; top: 0; left: 0; right: 0; z-index: 100; padding: 20px 40px; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
        <div data-gjs-type="heading" style="font-size: 20px; font-weight: 900; color: var(--foreground);">EVENTOS</div>
        <div data-gjs-type="button-group" style="display: flex; gap: 28px;">
          ${['Speakers', 'Agenda', 'Venue', 'Contact'].map(l => `<a data-gjs-type="button" href="#" style="color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 500;">${l}</a>`).join('')}
        </div>
        <a data-gjs-type="button" href="#" style="background: var(--border-default, var(--muted)); border: 1px solid var(--muted); color: var(--background); padding: 9px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; text-decoration: none; backdrop-filter: blur(8px);">Register</a>
      </nav>`,
  });

  bm.add('nav-breadcrumb', {
    label: card(icon('<polyline points="9 18 15 12 9 6"/>'), 'Breadcrumb'),
    category: 'Navigation',
    content: `
      <nav data-gjs-type="breadcrumb" style="padding: 12px 24px; font-size: 13px; color: var(--muted-foreground); box-sizing: border-box;">
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
      <div data-gjs-type="progress-bar" style="position: fixed; top: 0; left: 0; right: 0; z-index: 200; height: 3px; background: var(--border-subtle, var(--muted));">
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
      <div data-gjs-type="countdown" data-target="2026-10-24T09:00:00" data-title="Event starts in" data-show-labels="true" style="display: flex; gap: 16px; justify-content: center; align-items: center; flex-wrap: wrap; padding: 32px; box-sizing: border-box;">
        ${[['45', 'Days'], ['12', 'Hours'], ['38', 'Minutes'], ['52', 'Seconds']].map(([n, l]) => `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; background: var(--muted); border: 1px solid var(--border); border-radius: 14px; padding: 20px 24px; min-width: 88px; text-align: center;">
            <div data-role="${l.toLowerCase().replace('minutes', 'minutes').replace('seconds', 'seconds')}" style="font-size: 48px; font-weight: 900; color: var(--pri, var(--primary)); line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums;">${n}</div>
            <div data-role="countdown-label" style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted-foreground);">${l}</div>
          </div>`).join('')}
      </div>`,
  });

  bm.add('util-map', {
    label: card(icon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'), 'Map Embed'),
    category: 'Utilities',
    content: `
      <div data-gjs-type="map" style="width: 100%; height: 360px; border-radius: 16px; overflow: hidden; border: 1px solid var(--border);">
        <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d100939.98555098464!2d-122.507640!3d37.757815!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x80859a6d00690021%3A0x4a501367f076adff!2sSan+Francisco%2C+CA!5e0!3m2!1sen!2sus!4v1234567890" width="100%" height="100%" style="border: 0; display: block;" allowfullscreen loading="lazy"></iframe>
      </div>`,
  });

  bm.add('util-qr-code', {
    label: card(icon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="5" y="5" width="3" height="3"/><rect x="16" y="5" width="3" height="3"/><rect x="5" y="16" width="3" height="3"/><path d="M14 14h3v3h3v3h-3v-3h-3z"/>'), 'QR Code'),
    category: 'Utilities',
    content: `
      <div data-gjs-type="qr-code" style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px; text-align: center; box-sizing: border-box;">
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
      <div data-gjs-type="social-icons" data-platforms='[{"platform":"facebook","label":"Facebook","url":"https://facebook.com/"},{"platform":"instagram","label":"Instagram","url":"https://instagram.com/"},{"platform":"linkedin","label":"LinkedIn","url":"https://linkedin.com/company/"},{"platform":"x","label":"X","url":"https://x.com/"}]' data-icon-style="filled" data-shape="soft" style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 16px 0; box-sizing: border-box;">
        <a data-gjs-type="social-icon" data-platform="facebook" href="https://facebook.com/" aria-label="Facebook" title="Facebook" target="_blank" rel="noopener noreferrer" style="width:40px;height:40px;border-radius:10px;background:var(--border-subtle, var(--muted));border:1px solid var(--border-default, var(--border));display:inline-flex;align-items:center;justify-content:center;color:var(--pri,var(--primary));text-decoration:none;box-sizing:border-box;"><span aria-hidden="true" style="display:block;width:18px;height:18px;background:currentColor;-webkit-mask:url('https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/facebook.svg') center / contain no-repeat;mask:url('https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/facebook.svg') center / contain no-repeat;"></span></a>
        <a data-gjs-type="social-icon" data-platform="instagram" href="https://instagram.com/" aria-label="Instagram" title="Instagram" target="_blank" rel="noopener noreferrer" style="width:40px;height:40px;border-radius:10px;background:var(--border-subtle, var(--muted));border:1px solid var(--border-default, var(--border));display:inline-flex;align-items:center;justify-content:center;color:var(--pri,var(--primary));text-decoration:none;box-sizing:border-box;"><span aria-hidden="true" style="display:block;width:18px;height:18px;background:currentColor;-webkit-mask:url('https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/instagram.svg') center / contain no-repeat;mask:url('https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/instagram.svg') center / contain no-repeat;"></span></a>
        <a data-gjs-type="social-icon" data-platform="linkedin" href="https://linkedin.com/company/" aria-label="LinkedIn" title="LinkedIn" target="_blank" rel="noopener noreferrer" style="width:40px;height:40px;border-radius:10px;background:var(--border-subtle, var(--muted));border:1px solid var(--border-default, var(--border));display:inline-flex;align-items:center;justify-content:center;color:var(--pri,var(--primary));text-decoration:none;box-sizing:border-box;"><span aria-hidden="true" style="display:block;width:18px;height:18px;background:currentColor;-webkit-mask:url('https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/linkedin.svg') center / contain no-repeat;mask:url('https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/linkedin.svg') center / contain no-repeat;"></span></a>
        <a data-gjs-type="social-icon" data-platform="x" href="https://x.com/" aria-label="X" title="X" target="_blank" rel="noopener noreferrer" style="width:40px;height:40px;border-radius:10px;background:var(--border-subtle, var(--muted));border:1px solid var(--border-default, var(--border));display:inline-flex;align-items:center;justify-content:center;color:var(--pri,var(--primary));text-decoration:none;box-sizing:border-box;"><span aria-hidden="true" style="display:block;width:18px;height:18px;background:currentColor;-webkit-mask:url('https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/twitter.svg') center / contain no-repeat;mask:url('https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/twitter.svg') center / contain no-repeat;"></span></a>
      </div>`,
  });

  bm.add('util-badge', {
    label: card(icon('<rect x="1" y="8" width="22" height="8" rx="4"/>'), 'Badge'),
    category: 'Utilities',
    content: `<span data-gjs-type="badge" style="display: inline-block; background: var(--muted); color: var(--pri, var(--primary)); padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);">New</span>`,
  });

  bm.add('util-alert', {
    label: card(icon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'), 'Alert Banner'),
    category: 'Utilities',
    content: `
      <div data-gjs-type="alert" style="display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-radius: 10px; background: color-mix(in srgb, var(--primary) 10%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent); color: var(--foreground); font-size: 14px; box-sizing: border-box;">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--pri, var(--primary))" stroke-width="2" style="width: 18px; height: 18px; flex-shrink: 0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Early bird registration ends <strong>October 1, 2026</strong>. Register now to save 30%!</span>
      </div>`,
  });
}
