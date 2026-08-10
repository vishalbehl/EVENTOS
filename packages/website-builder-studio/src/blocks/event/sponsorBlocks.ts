import type { Editor } from 'grapesjs';
import type { EventDataSnapshot } from '../../types';

const icon = (paths: string) => `<svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const card = (svg: string, label: string) => `<div class="gjs-block-custom"><div class="gjs-block-icon-wrapper">${svg}</div><div class="gjs-block-label">${label}</div></div>`;

export function registerSponsorBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;
  const sponsors = s?.sponsors?.length ? s.sponsors : [
    { id: '1', name: 'Microsoft', logoUrl: '', websiteUrl: '#', tier: 'PLATINUM' as const },
    { id: '2', name: 'Google', logoUrl: '', websiteUrl: '#', tier: 'PLATINUM' as const },
    { id: '3', name: 'AWS', logoUrl: '', websiteUrl: '#', tier: 'GOLD' as const },
    { id: '4', name: 'Cisco', logoUrl: '', websiteUrl: '#', tier: 'GOLD' as const },
    { id: '5', name: 'IBM', logoUrl: '', websiteUrl: '#', tier: 'SILVER' as const },
    { id: '6', name: 'Oracle', logoUrl: '', websiteUrl: '#', tier: 'SILVER' as const },
    { id: '7', name: 'Salesforce', logoUrl: '', websiteUrl: '#', tier: 'BRONZE' as const },
    { id: '8', name: 'SAP', logoUrl: '', websiteUrl: '#', tier: 'BRONZE' as const },
  ];

  const tierOrder = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'PARTNER', 'EXHIBITOR', 'MEDIA', 'ACADEMIC'] as const;
  const tierConfig: Record<string, { label: string; size: number; opacity: number; color: string }> = {
    PLATINUM: { label: 'Platinum Sponsors', size: 160, opacity: 1, color: 'var(--foreground)' },
    GOLD: { label: 'Gold Sponsors', size: 120, opacity: 0.9, color: '#fde68a' },
    SILVER: { label: 'Silver Sponsors', size: 90, opacity: 0.8, color: 'var(--muted-foreground)' },
    BRONZE: { label: 'Bronze Sponsors', size: 72, opacity: 0.7, color: '#d97706' },
    PARTNER: { label: 'Partners', size: 64, opacity: 0.65, color: 'var(--muted-foreground)' },
    EXHIBITOR: { label: 'Exhibitors', size: 56, opacity: 0.6, color: 'var(--muted-foreground)' },
    MEDIA: { label: 'Media Partners', size: 56, opacity: 0.6, color: 'var(--muted-foreground)' },
    ACADEMIC: { label: 'Academic Partners', size: 56, opacity: 0.6, color: 'var(--muted-foreground)' },
  };

  const logoPlaceholder = (name: string, size: number) =>
    `<div style="width: ${size}px; height: ${size * 0.45}px; display: flex; align-items: center; justify-content: center; font-size: ${Math.max(10, size * 0.14)}px; font-weight: 900; color: var(--muted); letter-spacing: -0.02em; text-transform: uppercase;">${name}</div>`;

  // ── Variant 1: Tiered ─────────────────────────────────────────────────────
  bm.add('sponsors-tiered', {
    label: card(icon('<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="5" y="11" width="14" height="4" rx="1"/><rect x="7" y="18" width="10" height="3" rx="1"/>'), 'Sponsors Tiered'),
    category: 'Sponsors & Partners',
    content: `
      <section data-gjs-type="sponsor-grid" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1100px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 60px;">
            <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">Our Supporters</p>
            <h2 style="font-size: 42px; font-weight: 900; color: var(--foreground); margin: 0 0 12px 0; letter-spacing: -0.02em;">Sponsors & Partners</h2>
            <p style="font-size: 16px; color: var(--muted-foreground); max-width: 480px; margin: 0 auto;">This event is made possible by the generous support of our sponsors.</p>
          </div>
          ${tierOrder.map(tier => {
            const tierSponsors = sponsors.filter(sp => sp.tier === tier);
            if (!tierSponsors.length) return '';
            const cfg = tierConfig[tier];
            return `
              <div style="margin-bottom: 48px;">
                <p style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--foreground); text-align: center; margin: 0 0 24px 0;">${cfg.label}</p>
                <div style="display: flex; justify-content: center; align-items: center; gap: 32px; flex-wrap: wrap; opacity: ${cfg.opacity};">
                  ${tierSponsors.map(sp => `
                    <a href="${sp.websiteUrl || '#'}" target="_blank" style="text-decoration: none; display: flex; align-items: center; justify-content: center; padding: 16px 24px; background: var(--muted); border: 1px solid var(--border); border-radius: 14px; transition: all 0.2s; min-width: 120px;">
                      ${sp.logoUrl ? `<img src="${sp.logoUrl}" alt="${sp.name}" style="max-width: ${cfg.size}px; max-height: ${cfg.size * 0.5}px; object-fit: contain; filter: brightness(0) invert(1) opacity(0.7);" />` : logoPlaceholder(sp.name, cfg.size)}
                    </a>`).join('')}
                </div>
              </div>`;
          }).join('')}
          <div style="text-align: center; margin-top: 20px;">
            <a href="#sponsor-us" style="display: inline-flex; align-items: center; gap: 8px; color: var(--pri, var(--primary)); font-size: 14px; font-weight: 700; text-decoration: none; border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); padding: 10px 20px; border-radius: 8px; background: var(--muted);">Become a Sponsor →</a>
          </div>
        </div>
      </section>`,
  });

  // ── Variant 2: Logo Grid ──────────────────────────────────────────────────
  bm.add('sponsors-grid', {
    label: card(icon('<rect x="2" y="6" width="8" height="6" rx="1"/><rect x="14" y="6" width="8" height="6" rx="1"/><rect x="2" y="16" width="8" height="6" rx="1"/><rect x="14" y="16" width="8" height="6" rx="1"/>'), 'Sponsors Grid'),
    category: 'Sponsors & Partners',
    content: `
      <section data-gjs-type="sponsor-grid" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1000px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: 36px; font-weight: 900; color: var(--foreground); margin: 0 0 40px 0; letter-spacing: -0.02em;">Supported By</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px;">
            ${sponsors.map(sp => `
              <a href="${sp.websiteUrl || '#'}" target="_blank" style="display: flex; align-items: center; justify-content: center; padding: 20px; background: var(--muted); border: 1px solid var(--muted); border-radius: 14px; min-height: 80px; text-decoration: none; transition: all 0.2s;">
                ${sp.logoUrl ? `<img src="${sp.logoUrl}" alt="${sp.name}" style="max-width: 120px; max-height: 40px; object-fit: contain; filter: brightness(0) invert(1) opacity(0.6);" />` : `<span style="font-size: 14px; font-weight: 900; color: var(--muted); letter-spacing: -0.01em;">${sp.name}</span>`}
              </a>`).join('')}
          </div>
        </div>
      </section>`,
  });

  // ── Variant 3: Logo Marquee ───────────────────────────────────────────────
  bm.add('sponsors-marquee', {
    label: card(icon('<path d="M5 12h14M12 5l7 7-7 7"/>'), 'Sponsor Marquee'),
    category: 'Sponsors & Partners',
    content: `
      <section data-gjs-type="sponsor-grid" style="padding: 48px 0; background: var(--muted); border-top: 1px solid var(--border-subtle, var(--muted)); border-bottom: 1px solid var(--border-subtle, var(--muted)); overflow: hidden; box-sizing: border-box;">
        <p style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--foreground); text-align: center; margin: 0 0 28px 0;">Trusted By Industry Leaders</p>
        <div style="display: flex; gap: 48px; align-items: center; overflow: hidden; padding: 0 24px;">
          ${[...sponsors, ...sponsors].map(sp => `
            <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; min-width: 120px;">
              ${sp.logoUrl ? `<img src="${sp.logoUrl}" alt="${sp.name}" style="max-width: 100px; max-height: 36px; object-fit: contain; filter: brightness(0) invert(1) opacity(0.5);" />` : `<span style="font-size: 16px; font-weight: 900; color: var(--muted); letter-spacing: -0.01em; white-space: nowrap;">${sp.name}</span>`}
            </div>`).join('')}
        </div>
      </section>`,
  });
}

export function registerRegistrationBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;
  const tickets = s?.ticketCategories?.length ? s.ticketCategories : [
    { id: '1', name: 'Student', price: 150, currency: 'USD', description: 'For full-time students with valid ID', deadline: '2026-10-01', benefits: ['All sessions', 'Workshop access', 'Certificate', 'Lunch included'], registrationUrl: '#', isHighlighted: false },
    { id: '2', name: 'Professional', price: 450, currency: 'USD', description: 'For industry professionals and researchers', deadline: '2026-10-01', benefits: ['All sessions', 'Workshop access', 'Networking dinner', 'Certificate', 'Lunch included', 'Proceedings'], registrationUrl: '#', isHighlighted: true },
    { id: '3', name: 'Virtual', price: 99, currency: 'USD', description: 'Online access to all live-streamed sessions', deadline: '2026-10-20', benefits: ['Live stream access', 'Q&A participation', 'Digital certificate', 'Session recordings'], registrationUrl: '#', isHighlighted: false },
  ];

  const importantDates = s?.importantDates?.length ? s.importantDates : [
    { id: '1', label: 'Abstract Submission Deadline', date: '2026-08-31', type: 'ABSTRACT' as const },
    { id: '2', label: 'Acceptance Notification', date: '2026-09-15', type: 'NOTIFICATION' as const },
    { id: '3', label: 'Early Bird Registration', date: '2026-09-30', type: 'EARLY_BIRD' as const },
    { id: '4', label: 'Final Registration', date: '2026-10-15', type: 'REGISTRATION' as const },
    { id: '5', label: 'Conference Opens', date: '2026-10-24', type: 'CONFERENCE' as const },
  ];

  // ── Variant 1: Ticket Cards ───────────────────────────────────────────────
  bm.add('tickets-cards', {
    label: card(icon('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/>'), 'Ticket Cards'),
    category: 'Tickets & Registration',
    content: `
      <section data-gjs-type="sponsor-grid" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1000px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 56px;">
            <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">Secure Your Seat</p>
            <h2 style="font-size: 42px; font-weight: 900; color: var(--foreground); margin: 0 0 12px 0; letter-spacing: -0.02em;">Registration</h2>
            <p style="font-size: 16px; color: var(--muted-foreground);">Choose the ticket that best suits your attendance needs.</p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; align-items: stretch;">
            ${tickets.map(t => `
              <div style="background: ${t.isHighlighted ? 'var(--muted)' : 'var(--muted)'}; border: ${t.isHighlighted ? '2px solid var(--pri, var(--primary))' : '1px solid var(--border)'}; border-radius: 20px; padding: 28px; display: flex; flex-direction: column; gap: 16px; position: relative; box-sizing: border-box;">
                ${t.isHighlighted ? `<div style="position: absolute; top: -1px; left: 50%; transform: translateX(-50%); background: var(--pri, var(--primary)); color: var(--background); padding: 4px 16px; border-radius: 0 0 10px 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap;">Most Popular</div>` : ''}
                <div>
                  <h3 style="font-size: 20px; font-weight: 800; color: var(--foreground); margin: 0 0 6px 0;">${t.name}</h3>
                  <p style="font-size: 13px; color: var(--muted-foreground); margin: 0 0 16px 0; line-height: 1.5;">${t.description || ''}</p>
                  <div style="font-size: 42px; font-weight: 900; color: ${t.isHighlighted ? 'var(--pri, var(--primary))' : 'var(--foreground)'}; line-height: 1; letter-spacing: -0.02em;">$${t.price}<span style="font-size: 16px; font-weight: 500; color: var(--muted-foreground); margin-left: 4px;">${t.currency}</span></div>
                  ${t.deadline ? `<p style="font-size: 12px; color: var(--muted-foreground); margin: 6px 0 0 0;">Deadline: ${new Date(t.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>` : ''}
                </div>
                <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; flex: 1;">
                  ${(t.benefits || []).map(b => `<li style="display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--muted-foreground);"><span style="color: var(--pri, var(--primary)); flex-shrink: 0;">✓</span>${b}</li>`).join('')}
                </ul>
                <a href="${t.registrationUrl || '#register'}" style="display: block; text-align: center; background: ${t.isHighlighted ? 'var(--pri, var(--primary))' : 'var(--border-subtle, var(--muted))'}; color: ${t.isHighlighted ? 'var(--background)' : 'var(--foreground)'}; padding: 13px 24px; border-radius: 10px; font-weight: 700; font-size: 14px; text-decoration: none; ${t.isHighlighted ? 'box-shadow: 0 8px 20px color-mix(in srgb, var(--primary) 30%, transparent);' : 'border: 1px solid var(--muted);'}">Register — ${t.name}</a>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });

  // ── Variant 2: Registration CTA Banner ────────────────────────────────────
  bm.add('registration-cta-banner', {
    label: card(icon('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>'), 'Register CTA'),
    category: 'Tickets & Registration',
    content: `
      <section data-gjs-type="sponsor-grid" style="padding: 80px 24px; background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 15%, transparent) 0%, var(--muted) 100%); border-top: 1px solid var(--muted); border-bottom: 1px solid var(--muted); box-sizing: border-box; text-align: center;">
        <div style="max-width: 700px; margin: 0 auto;">
          <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 16px 0;">Limited Seats Available</p>
          <h2 style="font-size: 42px; font-weight: 900; color: var(--foreground); margin: 0 0 16px 0; letter-spacing: -0.02em;">Ready to Join Us?</h2>
          <p style="font-size: 18px; color: var(--muted-foreground); line-height: 1.65; margin: 0 0 36px 0;">Secure your spot at the most anticipated conference of the year. Early bird discounts available until October 1.</p>
          <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
            <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 16px 40px; border-radius: 12px; font-weight: 800; font-size: 16px; text-decoration: none; box-shadow: 0 12px 28px var(--muted);">Register Now</a>
            <a href="#tickets" style="background: var(--border); color: var(--foreground); border: 1px solid var(--border-strong, var(--muted)); padding: 16px 32px; border-radius: 12px; font-weight: 700; font-size: 16px; text-decoration: none; backdrop-filter: blur(8px);">View Pricing</a>
          </div>
        </div>
      </section>`,
  });

  // ── Variant 3: Important Dates ────────────────────────────────────────────
  bm.add('important-dates', {
    label: card(icon('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'), 'Important Dates'),
    category: 'Tickets & Registration',
    content: `
      <section data-gjs-type="sponsor-grid" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 800px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 48px;">
            <h2 style="font-size: 38px; font-weight: 900; color: var(--foreground); margin: 0 0 8px 0; letter-spacing: -0.02em;">Important Dates</h2>
            <p style="font-size: 15px; color: var(--muted-foreground);">Mark your calendar and don't miss the deadlines</p>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0; position: relative;">
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: linear-gradient(to bottom, var(--pri, var(--primary)), color-mix(in srgb, var(--primary) 10%, transparent));"></div>
            ${importantDates.map((d, i) => {
              const dateObj = new Date(d.date + 'T00:00:00');
              const isPast = dateObj < new Date();
              return `
                <div style="display: flex; gap: 24px; padding: 20px 0 20px 28px; position: relative;">
                  <div style="position: absolute; left: -5px; top: 26px; width: 12px; height: 12px; border-radius: 50%; background: ${isPast ? 'var(--muted-foreground)' : 'var(--pri, var(--primary))'}; border: 2px solid ${isPast ? 'var(--muted)' : 'var(--muted)'}; z-index: 1;"></div>
                  <div style="width: 100px; flex-shrink: 0; text-align: right;">
                    <div style="font-size: 16px; font-weight: 800; color: ${isPast ? 'var(--muted-foreground)' : 'var(--foreground)'};">${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    <div style="font-size: 12px; color: var(--foreground);">${dateObj.getFullYear()}</div>
                  </div>
                  <div>
                    <div style="font-size: 15px; font-weight: 700; color: ${isPast ? 'var(--muted-foreground)' : 'var(--foreground)'}; margin-bottom: 2px;">${d.label}</div>
                    ${isPast ? `<span style="font-size: 11px; font-weight: 700; color: var(--foreground); text-transform: uppercase; letter-spacing: 0.06em;">Closed</span>` : `<span style="font-size: 11px; font-weight: 700; color: var(--pri, var(--primary)); text-transform: uppercase; letter-spacing: 0.06em;">Open</span>`}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </section>`,
  });
}
