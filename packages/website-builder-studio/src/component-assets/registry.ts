import type { WebsiteComponentAsset } from './types';

const techHeroHtml = `
<section data-gjs-type="hero" data-component-type="hero" style="min-height:760px;display:flex;align-items:center;justify-content:center;padding:112px 32px 96px;background:radial-gradient(circle at 20% 20%,rgba(124,58,237,.34),transparent 34%),linear-gradient(135deg,#060914 0%,#171033 58%,#050814 100%);color:#ffffff;box-sizing:border-box;text-align:center;">
  <div style="width:100%;max-width:1120px;margin:0 auto;">
    <div style="display:inline-flex;gap:12px;align-items:center;padding:10px 18px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#c4b5fd;font-weight:800;margin-bottom:30px;">October 24 - 26, 2026 <span style="opacity:.6;">•</span> San Francisco, CA</div>
    <h1 style="font-size:72px;line-height:1.04;margin:0 0 24px;font-weight:900;letter-spacing:0;color:#ffffff;">Global Tech Summit 2026</h1>
    <p style="font-size:22px;line-height:1.55;color:#cbd5e1;max-width:760px;margin:0 auto 40px;">A three-day event website for keynotes, agenda updates, registrations, sponsors, and venue information.</p>
    <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
      <a href="#register" data-gjs-type="button" style="display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 34px;border-radius:14px;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:900;">Register Now</a>
      <a href="#agenda" data-gjs-type="button" style="display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 34px;border-radius:14px;border:1px solid rgba(255,255,255,.22);color:#ffffff;text-decoration:none;font-weight:800;">View Agenda</a>
    </div>
  </div>
</section>`.trim();

const speakerShowcaseHtml = `
<section data-gjs-type="speaker-grid" data-component-type="speaker-grid" style="padding:96px 32px;background:#060914;color:#ffffff;box-sizing:border-box;">
  <div style="max-width:1180px;margin:0 auto;">
    <p style="margin:0 0 10px;color:#a78bfa;text-transform:uppercase;font-size:13px;font-weight:900;letter-spacing:.12em;">Featured speakers</p>
    <h2 style="margin:0 0 34px;font-size:44px;line-height:1.12;color:#ffffff;">Industry voices with sharp points of view</h2>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;">
      <article style="padding:22px;border-radius:20px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);"><img src="https://i.pravatar.cc/320?u=tech-speaker-1" alt="Dr. Sarah Chen" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:16px;margin-bottom:18px;" /><h3 style="font-size:22px;margin:0 0 6px;color:#ffffff;">Dr. Sarah Chen</h3><p style="margin:0;color:#94a3b8;">AI Research Lead</p></article>
      <article style="padding:22px;border-radius:20px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);"><img src="https://i.pravatar.cc/320?u=tech-speaker-2" alt="Prof. James Park" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:16px;margin-bottom:18px;" /><h3 style="font-size:22px;margin:0 0 6px;color:#ffffff;">Prof. James Park</h3><p style="margin:0;color:#94a3b8;">Systems Architect</p></article>
      <article style="padding:22px;border-radius:20px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);"><img src="https://i.pravatar.cc/320?u=tech-speaker-3" alt="Elena Rostova" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:16px;margin-bottom:18px;" /><h3 style="font-size:22px;margin:0 0 6px;color:#ffffff;">Elena Rostova</h3><p style="margin:0;color:#94a3b8;">Product Strategy VP</p></article>
    </div>
  </div>
</section>`.trim();

const agendaTimelineHtml = `
<section data-gjs-type="agenda" data-component-type="agenda" style="padding:96px 32px;background:#ffffff;color:#111827;box-sizing:border-box;">
  <div style="max-width:1040px;margin:0 auto;">
    <p style="margin:0 0 10px;color:#7c3aed;text-transform:uppercase;font-size:13px;font-weight:900;letter-spacing:.12em;">Agenda</p>
    <h2 style="margin:0 0 30px;font-size:42px;line-height:1.12;color:#111827;">A clean schedule for every track</h2>
    <div style="display:grid;gap:14px;">
      <article style="display:grid;grid-template-columns:150px 1fr;gap:20px;padding:22px;border:1px solid #e5e7eb;border-radius:18px;background:#f8fafc;"><strong>09:00</strong><div><h3 style="margin:0 0 8px;font-size:20px;">Opening Keynote</h3><p style="margin:0;color:#64748b;">The future of connected event experiences.</p></div></article>
      <article style="display:grid;grid-template-columns:150px 1fr;gap:20px;padding:22px;border:1px solid #e5e7eb;border-radius:18px;background:#f8fafc;"><strong>11:00</strong><div><h3 style="margin:0 0 8px;font-size:20px;">Product Architecture Forum</h3><p style="margin:0;color:#64748b;">Panels, demos, and practical implementation stories.</p></div></article>
      <article style="display:grid;grid-template-columns:150px 1fr;gap:20px;padding:22px;border:1px solid #e5e7eb;border-radius:18px;background:#f8fafc;"><strong>16:00</strong><div><h3 style="margin:0 0 8px;font-size:20px;">Networking Reception</h3><p style="margin:0;color:#64748b;">Hosted sponsor conversations and attendee meetups.</p></div></article>
    </div>
  </div>
</section>`.trim();

const sponsorMarqueeHtml = `
<section data-gjs-type="sponsor-grid" data-component-type="sponsor-grid" style="padding:74px 32px;background:#0b1020;color:#ffffff;box-sizing:border-box;overflow:hidden;">
  <div style="max-width:1180px;margin:0 auto;text-align:center;">
    <p style="margin:0 0 10px;color:#a78bfa;text-transform:uppercase;font-size:13px;font-weight:900;letter-spacing:.12em;">Sponsors</p>
    <h2 style="margin:0 0 32px;font-size:38px;color:#ffffff;">Trusted by event partners</h2>
    <div data-gjs-type="logo-marquee" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;">
      <div style="padding:28px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-weight:900;">ACME</div>
      <div style="padding:28px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-weight:900;">NOVA</div>
      <div style="padding:28px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-weight:900;">AXIS</div>
      <div style="padding:28px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-weight:900;">ORBIT</div>
      <div style="padding:28px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-weight:900;">PULSE</div>
    </div>
  </div>
</section>`.trim();

const venueFeatureHtml = `
<section data-gjs-type="venue" data-component-type="venue" style="padding:96px 32px;background:#f8fafc;color:#0f172a;box-sizing:border-box;">
  <div style="max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center;">
    <div><p style="margin:0 0 10px;color:#7c3aed;text-transform:uppercase;font-size:13px;font-weight:900;letter-spacing:.12em;">Venue</p><h2 style="margin:0 0 18px;font-size:42px;">Moscone Center, San Francisco</h2><p style="margin:0 0 24px;color:#64748b;font-size:18px;line-height:1.65;">A central venue block with address, travel notes, map link, and hotel guidance for event visitors.</p><a href="#map" style="color:#7c3aed;font-weight:900;text-decoration:none;">Open directions</a></div>
    <div style="min-height:360px;border-radius:24px;background:linear-gradient(135deg,#dbeafe,#c4b5fd);border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;color:#312e81;font-weight:900;font-size:28px;">Venue map preview</div>
  </div>
</section>`.trim();

const registrationBandHtml = `
<section id="register" data-gjs-type="pricing" data-component-type="registration-cta" style="padding:86px 32px;background:#7c3aed;color:#ffffff;box-sizing:border-box;">
  <div style="max-width:1060px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;">
    <div><p style="margin:0 0 8px;color:#ddd6fe;font-weight:900;text-transform:uppercase;letter-spacing:.12em;font-size:13px;">Registration</p><h2 style="margin:0;font-size:42px;line-height:1.12;">Ready to launch your event website?</h2></div>
    <a href="/registration" data-link-type="registration" style="display:inline-flex;align-items:center;justify-content:center;min-height:56px;padding:0 34px;border-radius:14px;background:#ffffff;color:#5b21b6;text-decoration:none;font-weight:900;">Register Now</a>
  </div>
</section>`.trim();

const eventFooterHtml = `
<footer data-gjs-type="footer" data-component-type="footer" style="padding:64px 32px 34px;background:#050814;color:#ffffff;border-top:1px solid rgba(255,255,255,.12);box-sizing:border-box;">
  <div style="max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1.2fr .8fr 1fr;gap:28px;">
    <div><h2 style="margin:0 0 12px;font-size:24px;color:#ffffff;">EVENTOS</h2><p style="margin:0;color:#94a3b8;line-height:1.6;">Static multi-page event websites with editable sections and publishable updates.</p></div>
    <nav data-gjs-type="navigation" style="display:grid;gap:10px;"><a href="/" style="color:#cbd5e1;text-decoration:none;">Home</a><a href="/agenda" style="color:#cbd5e1;text-decoration:none;">Agenda</a><a href="/speakers" style="color:#cbd5e1;text-decoration:none;">Speakers</a></nav>
    <form data-gjs-type="newsletter" style="display:grid;gap:10px;"><label style="font-weight:800;">Get updates</label><input placeholder="Email address" style="height:46px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#ffffff;padding:0 14px;" /><button type="button" style="height:46px;border:0;border-radius:12px;background:#7c3aed;color:#ffffff;font-weight:900;">Subscribe</button></form>
  </div>
</footer>`.trim();

function eventHeaderHtml(accent = '#7c3aed', links: Array<[string, string]> = [
  ['Home', '/'],
  ['Speakers', '/speakers'],
  ['Agenda', '/agenda'],
  ['Venue', '/venue'],
]): string {
  return `<header data-gjs-type="header" data-component-type="header" style="position:relative;width:100%;padding:18px 32px;background:#050814;color:#ffffff;border-bottom:1px solid rgba(255,255,255,.1);box-sizing:border-box;">
  <div style="max-width:1180px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:24px;">
    <a href="/" data-gjs-type="button" style="color:#ffffff;text-decoration:none;font-size:20px;font-weight:900;">EVENTOS</a>
    <nav data-gjs-type="navigation" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">${links.map(([label, href]) => `<a href="${href}" data-gjs-type="button" style="color:#cbd5e1;text-decoration:none;font-weight:700;">${label}</a>`).join('')}</nav>
    <a href="/registration" data-gjs-type="button" data-link-type="registration" style="display:inline-flex;align-items:center;min-height:44px;padding:0 20px;border-radius:10px;background:${accent};color:#ffffff;text-decoration:none;font-weight:900;">Register</a>
  </div>
</header>`;
}

function templateFooterHtml(accent: string, links: Array<[string, string]>): string {
  return `<footer data-gjs-type="footer" data-component-type="footer" style="padding:54px 32px 30px;background:#050814;color:#ffffff;border-top:1px solid rgba(255,255,255,.12);box-sizing:border-box;">
  <div style="max-width:1180px;margin:0 auto;display:flex;align-items:flex-start;justify-content:space-between;gap:32px;flex-wrap:wrap;">
    <div style="max-width:430px;"><h2 style="margin:0 0 10px;font-size:22px;color:#ffffff;">EVENTOS</h2><p style="margin:0;color:#94a3b8;line-height:1.6;">Event information, programme updates, speakers, registration, and venue details in one clear website.</p></div>
    <nav data-gjs-type="navigation" style="display:flex;gap:20px;flex-wrap:wrap;">${links.map(([label, href]) => `<a href="${href}" data-gjs-type="button" style="color:#cbd5e1;text-decoration:none;font-weight:700;">${label}</a>`).join('')}</nav>
    <a href="/registration" data-link-type="registration" data-gjs-type="button" style="color:${accent};font-weight:900;text-decoration:none;">Registration portal</a>
  </div>
</footer>`;
}

const techHeaderHtml = eventHeaderHtml();
const techFooterHtml = templateFooterHtml('#a78bfa', [['Home', '/'], ['Speakers', '/speakers'], ['Agenda', '/agenda'], ['Venue', '/venue']]);
const fullTechTemplateHtml = [techHeaderHtml, techHeroHtml, speakerShowcaseHtml, agendaTimelineHtml, sponsorMarqueeHtml, venueFeatureHtml, registrationBandHtml, techFooterHtml].join('\n');

const academicTemplateHtml = `
<section data-gjs-type="hero" data-component-type="hero" style="min-height:720px;padding:108px 32px;background:#fbfbf8;color:#111827;box-sizing:border-box;display:flex;align-items:center;">
  <div style="max-width:1120px;margin:0 auto;display:grid;grid-template-columns:1fr .82fr;gap:48px;align-items:center;">
    <div><p style="margin:0 0 12px;color:#be123c;text-transform:uppercase;font-size:13px;font-weight:900;letter-spacing:.14em;">Call for papers</p><h1 style="font-size:64px;line-height:1.02;margin:0 0 22px;font-weight:900;color:#111827;">International Academic Symposium</h1><p style="font-size:20px;line-height:1.6;color:#475569;margin:0 0 32px;">A refined conference template for research tracks, committees, paper submission, and proceedings.</p><a href="/speaker-portal" data-link-type="speaker-portal" style="display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 30px;border-radius:12px;background:#be123c;color:#ffffff;text-decoration:none;font-weight:900;">Submit Abstract</a></div>
    <div style="border-radius:28px;border:1px solid #e5e7eb;background:#ffffff;padding:28px;box-shadow:0 24px 70px rgba(15,23,42,.12);"><h2 style="margin:0 0 16px;font-size:24px;">Important dates</h2><p style="margin:0 0 12px;color:#64748b;">Abstract deadline: Aug 31, 2026</p><p style="margin:0;color:#64748b;">Notification: Sep 18, 2026</p></div>
  </div>
</section>
${agendaTimelineHtml}
${eventFooterHtml}`.trim();

const expoTemplateHtml = `
<section data-gjs-type="hero" data-component-type="hero" style="min-height:720px;padding:108px 32px;background:linear-gradient(135deg,#041016,#102a2a 58%,#061014);color:#ffffff;box-sizing:border-box;display:flex;align-items:center;">
  <div style="max-width:1180px;margin:0 auto;text-align:left;">
    <p style="margin:0 0 12px;color:#5eead4;text-transform:uppercase;font-size:13px;font-weight:900;letter-spacing:.14em;">Expo showcase</p>
    <h1 style="font-size:68px;line-height:1.04;margin:0 0 22px;font-weight:900;color:#ffffff;max-width:820px;">Global Trade Expo and Product Showcase</h1>
    <p style="font-size:21px;line-height:1.58;color:#cbd5e1;margin:0 0 36px;max-width:700px;">A sponsor-forward landing template for booths, floor plans, visitor passes, and partner demos.</p>
    <a href="/registration" data-link-type="registration" style="display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 30px;border-radius:12px;background:#14b8a6;color:#042f2e;text-decoration:none;font-weight:900;">Get Visitor Pass</a>
  </div>
</section>
${sponsorMarqueeHtml}
${venueFeatureHtml}
${eventFooterHtml}`.trim();

const techTemplatePages = [
  { id: 'page_tech_home', name: 'Home', slug: '', isHomePage: true, html: [techHeaderHtml, techHeroHtml, speakerShowcaseHtml, registrationBandHtml, techFooterHtml].join('\n') },
  { id: 'page_tech_speakers', name: 'Speakers', slug: 'speakers', isHomePage: false, html: [techHeaderHtml, speakerShowcaseHtml, techFooterHtml].join('\n') },
  { id: 'page_tech_agenda', name: 'Agenda', slug: 'agenda', isHomePage: false, html: [techHeaderHtml, agendaTimelineHtml.replace('<section ', '<section id="agenda" '), techFooterHtml].join('\n') },
  { id: 'page_tech_venue', name: 'Venue', slug: 'venue', isHomePage: false, html: [techHeaderHtml, venueFeatureHtml, techFooterHtml].join('\n') },
];

const academicLinks: Array<[string, string]> = [['Home', '/'], ['Programme', '/programme'], ['Speakers', '/speakers'], ['Committee', '/committee']];
const academicHeaderHtml = eventHeaderHtml('#be123c', academicLinks);
const academicFooterHtml = templateFooterHtml('#fb7185', academicLinks);
const academicHeroHtml = academicTemplateHtml.split(agendaTimelineHtml)[0].trim();
const academicTemplatePages = [
  { id: 'page_academic_home', name: 'Home', slug: '', isHomePage: true, html: [academicHeaderHtml, academicHeroHtml, academicFooterHtml].join('\n') },
  { id: 'page_academic_programme', name: 'Programme', slug: 'programme', isHomePage: false, html: [academicHeaderHtml, agendaTimelineHtml, academicFooterHtml].join('\n') },
  { id: 'page_academic_speakers', name: 'Speakers', slug: 'speakers', isHomePage: false, html: [academicHeaderHtml, speakerShowcaseHtml, academicFooterHtml].join('\n') },
  { id: 'page_academic_committee', name: 'Committee', slug: 'committee', isHomePage: false, html: [academicHeaderHtml, speakerShowcaseHtml.replace(/speaker-grid/g, 'committee').replace('Featured speakers', 'Scientific committee'), academicFooterHtml].join('\n') },
];

const expoLinks: Array<[string, string]> = [['Home', '/'], ['Exhibitors', '/exhibitors'], ['Venue', '/venue']];
const expoHeaderHtml = eventHeaderHtml('#14b8a6', expoLinks);
const expoFooterHtml = templateFooterHtml('#5eead4', expoLinks);
const expoHeroHtml = expoTemplateHtml.split(sponsorMarqueeHtml)[0].trim();
const expoTemplatePages = [
  { id: 'page_expo_home', name: 'Home', slug: '', isHomePage: true, html: [expoHeaderHtml, expoHeroHtml, sponsorMarqueeHtml, registrationBandHtml, expoFooterHtml].join('\n') },
  { id: 'page_expo_exhibitors', name: 'Exhibitors', slug: 'exhibitors', isHomePage: false, html: [expoHeaderHtml, sponsorMarqueeHtml, expoFooterHtml].join('\n') },
  { id: 'page_expo_venue', name: 'Venue', slug: 'venue', isHomePage: false, html: [expoHeaderHtml, venueFeatureHtml, expoFooterHtml].join('\n') },
];

function sectionToJson(id: string, html: string): unknown[] {
  return [
    {
      type: 'section',
      attributes: {
        'data-component-asset-id': id,
      },
      components: html,
    },
  ];
}

export const WEBSITE_COMPONENT_ASSETS: WebsiteComponentAsset[] = [
  {
    id: 'event-tech-hero',
    name: 'Event Tech Hero',
    kind: 'section',
    group: 'Event',
    description: 'Large event hero with event details, primary CTA, and secondary agenda link.',
    tags: ['hero', 'event', 'registration', 'conference'],
    preview: { accent: '#7c3aed', background: '#11102b', title: 'Global Tech Summit 2026', subtitle: 'Hero section' },
    html: techHeroHtml,
    json: { components: sectionToJson('event-tech-hero', techHeroHtml) },
  },
  {
    id: 'event-speaker-showcase',
    name: 'Speaker Showcase',
    kind: 'section',
    group: 'Event',
    description: 'Speaker grid with photo cards and editable speaker text.',
    tags: ['speakers', 'cards', 'event'],
    preview: { accent: '#a78bfa', background: '#060914', title: 'Featured speakers', subtitle: 'Speaker grid' },
    html: speakerShowcaseHtml,
    json: { components: sectionToJson('event-speaker-showcase', speakerShowcaseHtml) },
  },
  {
    id: 'event-agenda-timeline',
    name: 'Agenda Timeline',
    kind: 'section',
    group: 'Event',
    description: 'Readable agenda rows for sessions, tracks, and timings.',
    tags: ['agenda', 'sessions', 'timeline'],
    preview: { accent: '#7c3aed', background: '#ffffff', title: 'Agenda timeline', subtitle: 'Schedule rows' },
    html: agendaTimelineHtml,
    json: { components: sectionToJson('event-agenda-timeline', agendaTimelineHtml) },
  },
  {
    id: 'event-sponsor-marquee',
    name: 'Sponsor Logo Wall',
    kind: 'section',
    group: 'Event',
    description: 'Sponsor logos arranged as a polished logo wall.',
    tags: ['sponsors', 'logos', 'marquee'],
    preview: { accent: '#a78bfa', background: '#0b1020', title: 'Trusted partners', subtitle: 'Sponsor wall' },
    html: sponsorMarqueeHtml,
    json: { components: sectionToJson('event-sponsor-marquee', sponsorMarqueeHtml) },
  },
  {
    id: 'event-venue-feature',
    name: 'Venue Feature',
    kind: 'section',
    group: 'Event',
    description: 'Venue description with map/image placeholder and direction link.',
    tags: ['venue', 'map', 'location'],
    preview: { accent: '#7c3aed', background: '#f8fafc', title: 'Venue block', subtitle: 'Location section' },
    html: venueFeatureHtml,
    json: { components: sectionToJson('event-venue-feature', venueFeatureHtml) },
  },
  {
    id: 'event-registration-band',
    name: 'Registration CTA Band',
    kind: 'section',
    group: 'Event',
    description: 'High-contrast registration call-to-action for event pages.',
    tags: ['registration', 'cta', 'button'],
    preview: { accent: '#ffffff', background: '#7c3aed', title: 'Register now', subtitle: 'CTA section' },
    html: registrationBandHtml,
    json: { components: sectionToJson('event-registration-band', registrationBandHtml) },
  },
  {
    id: 'event-footer-system',
    name: 'Event Footer',
    kind: 'section',
    group: 'Navigation',
    description: 'Footer with brand copy, page links, and newsletter form.',
    tags: ['footer', 'newsletter', 'links'],
    preview: { accent: '#7c3aed', background: '#050814', title: 'Footer', subtitle: 'Links and signup' },
    html: eventFooterHtml,
    json: { components: sectionToJson('event-footer-system', eventFooterHtml) },
  },
  {
    id: 'template-global-tech-summit',
    name: 'Global Tech Summit',
    kind: 'template',
    group: 'Templates',
    description: 'Full event website starter with hero, speakers, agenda, sponsors, venue, CTA, and footer.',
    tags: ['template', 'conference', 'event'],
    preview: { accent: '#7c3aed', background: '#11102b', title: 'Global Tech Summit', subtitle: 'Full page template' },
    html: fullTechTemplateHtml,
    json: { components: sectionToJson('template-global-tech-summit', fullTechTemplateHtml) },
    template: {
      pages: techTemplatePages,
      theme: { primary: '#7c3aed', secondary: '#22d3ee', background: '#050814', surface: '#0b1020', card: '#11162a', border: '#29314a', textOnPrimary: '#ffffff', fontHeading: 'Inter, sans-serif', fontBody: 'Inter, sans-serif', radius: '14px' },
    },
  },
  {
    id: 'template-academic-symposium',
    name: 'Academic Symposium',
    kind: 'template',
    group: 'Templates',
    description: 'Editorial research event template with submission CTA, important dates, agenda, and footer.',
    tags: ['template', 'academic', 'papers', 'symposium'],
    preview: { accent: '#be123c', background: '#fbfbf8', title: 'Academic Symposium', subtitle: 'Full page template' },
    html: academicTemplateHtml,
    json: { components: sectionToJson('template-academic-symposium', academicTemplateHtml) },
    template: {
      pages: academicTemplatePages,
      theme: { primary: '#be123c', secondary: '#334155', background: '#fbfbf8', surface: '#ffffff', card: '#ffffff', border: '#e5e7eb', textOnPrimary: '#ffffff', fontHeading: 'Georgia, serif', fontBody: 'Inter, sans-serif', radius: '12px' },
    },
  },
  {
    id: 'template-expo-showcase',
    name: 'Expo Showcase',
    kind: 'template',
    group: 'Templates',
    description: 'Sponsor-led expo template with product showcase hero, sponsor wall, venue, and footer.',
    tags: ['template', 'expo', 'sponsors', 'passes'],
    preview: { accent: '#14b8a6', background: '#041016', title: 'Trade Expo', subtitle: 'Full page template' },
    html: expoTemplateHtml,
    json: { components: sectionToJson('template-expo-showcase', expoTemplateHtml) },
    template: {
      pages: expoTemplatePages,
      theme: { primary: '#14b8a6', secondary: '#5eead4', background: '#041016', surface: '#071b1d', card: '#0b2526', border: '#245253', textOnPrimary: '#042f2e', fontHeading: 'Inter, sans-serif', fontBody: 'Inter, sans-serif', radius: '12px' },
    },
  },
];

export const WEBSITE_COMPONENT_ASSET_GROUPS = ['All', 'Templates', 'Event', 'Navigation'] as const;

export function searchWebsiteComponentAssets(query: string, group = 'All'): WebsiteComponentAsset[] {
  const normalizedQuery = query.trim().toLowerCase();
  return WEBSITE_COMPONENT_ASSETS.filter((asset) => {
    const matchesGroup = group === 'All' || asset.group === group || asset.kind === group.toLowerCase();
    if (!matchesGroup) return false;
    if (!normalizedQuery) return true;
    const searchable = [asset.name, asset.group, asset.description, ...asset.tags].join(' ').toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

export function getWebsiteComponentAsset(id: string): WebsiteComponentAsset | undefined {
  return WEBSITE_COMPONENT_ASSETS.find((asset) => asset.id === id);
}
