import type { Editor } from 'grapesjs';
import type { EventDataSnapshot } from '../../types';

const icon = (paths: string) => `<svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const card = (svg: string, label: string) => `<div class="gjs-block-custom"><div class="gjs-block-icon-wrapper">${svg}</div><div class="gjs-block-label">${label}</div></div>`;

export function registerHeroBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;
  const name = s?.eventName || 'Global Summit 2026';
  const tagline = s?.tagline || 'Where Ideas Shape the Future';
  const startDate = s?.startDate ? new Date(s.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'October 24';
  const endDate = s?.endDate ? new Date(s.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'October 26, 2026';
  const city = s?.venue?.city || 'San Francisco, CA';
  const banner = s?.banner || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&auto=format&fit=crop';

  // ── Hero 1: Classic Centered ──────────────────────────────────────────────
  bm.add('hero-classic', {
    label: card(icon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h8M7 16h5"/>'), 'Hero Classic'),
    category: 'Hero & Headers',
    content: `
      <section data-gjs-type="hero" data-variant="classic" style="position: relative; min-height: 88vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--background) 0%, var(--background) 50%, var(--background) 100%); color: var(--background); text-align: center; padding: 80px 24px; overflow: hidden; box-sizing: border-box;">
        <div style="position: absolute; inset: 0; background: radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--primary) 25%, transparent) 0%, transparent 70%); pointer-events: none;"></div>
        <div style="position: relative; max-width: 900px; margin: 0 auto;">
          <div style="display: inline-flex; align-items: center; gap: 8px; background: var(--border); border: 1px solid var(--border-strong, var(--muted)); padding: 8px 18px; border-radius: 999px; font-size: 13px; font-weight: 700; color: var(--pri, var(--primary)); margin-bottom: 28px; letter-spacing: 0.04em;">
            📅 ${startDate}–${endDate} &nbsp;•&nbsp; 📍 ${city}
          </div>
          <h1 style="font-size: clamp(40px, 7vw, 72px); font-weight: 900; line-height: 1.08; margin: 0 0 20px 0; letter-spacing: -0.03em; background: linear-gradient(135deg, var(--foreground) 0%, var(--primary) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${name}</h1>
          <p style="font-size: clamp(16px, 2.5vw, 22px); color: var(--muted-foreground); max-width: 680px; margin: 0 auto 40px auto; line-height: 1.65;">${tagline}</p>
          <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
            <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 16px 36px; border-radius: 12px; font-weight: 800; font-size: 15px; text-decoration: none; box-shadow: 0 12px 28px var(--muted);">Register Now</a>
            <a href="#program" style="background: var(--border); color: var(--background); padding: 16px 36px; border-radius: 12px; font-weight: 700; font-size: 15px; text-decoration: none; border: 1px solid var(--border-strong, var(--muted)); backdrop-filter: blur(8px);">View Program</a>
          </div>
        </div>
      </section>`,
  });

  // ── Hero 2: Split Left ────────────────────────────────────────────────────
  bm.add('hero-split', {
    label: card(icon('<rect x="2" y="3" width="9" height="18" rx="2"/><rect x="13" y="3" width="9" height="18" rx="2"/>'), 'Hero Split'),
    category: 'Hero & Headers',
    content: `
      <section data-gjs-type="hero" data-variant="split" style="display: flex; min-height: 88vh; background: var(--background); overflow: hidden; box-sizing: border-box;">
        <div style="flex: 1; display: flex; align-items: center; padding: 60px 48px; box-sizing: border-box; min-width: 300px;">
          <div style="max-width: 520px;">
            <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">${startDate}–${endDate} · ${city}</p>
            <h1 style="font-size: clamp(36px, 5vw, 60px); font-weight: 900; line-height: 1.1; color: var(--foreground); margin: 0 0 20px 0; letter-spacing: -0.02em;">${name}</h1>
            <p style="font-size: 18px; color: var(--muted-foreground); line-height: 1.7; margin: 0 0 36px 0;">${tagline}</p>
            <div style="display: flex; gap: 14px; flex-wrap: wrap;">
              <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 14px 32px; border-radius: 10px; font-weight: 800; font-size: 15px; text-decoration: none;">Register Now</a>
              <a href="#about" style="color: var(--muted-foreground); padding: 14px 24px; font-weight: 600; font-size: 15px; text-decoration: none; border: 1px solid var(--muted); border-radius: 10px;">About Event →</a>
            </div>
          </div>
        </div>
        <div style="flex: 1; min-width: 300px; min-height: 400px; overflow: hidden; position: relative;">
          <img src="${banner}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
          <div style="position: absolute; inset: 0; background: linear-gradient(to right, var(--background) 0%, transparent 30%);"></div>
        </div>
      </section>`,
  });

  // ── Hero 3: Video Background ──────────────────────────────────────────────
  bm.add('hero-video', {
    label: card(icon('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>'), 'Hero Video BG'),
    category: 'Hero & Headers',
    content: `
      <section data-gjs-type="hero" data-variant="video" style="position: relative; min-height: 88vh; display: flex; align-items: center; justify-content: center; overflow: hidden; color: var(--background); text-align: center; padding: 80px 24px; box-sizing: border-box; background: var(--background);">
        <div style="position: absolute; inset: 0; background: linear-gradient(135deg, var(--muted) 0%, var(--muted) 100%); z-index: 1;"></div>
        <div style="position: relative; z-index: 2; max-width: 860px; margin: 0 auto;">
          <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 20px 0;">📅 ${startDate}–${endDate} · 📍 ${city}</p>
          <h1 style="font-size: clamp(40px, 7vw, 72px); font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; letter-spacing: -0.02em;">${name}</h1>
          <p style="font-size: 20px; color: var(--muted); margin: 0 auto 40px auto; max-width: 640px; line-height: 1.65;">${tagline}</p>
          <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 16px 40px; border-radius: 12px; font-weight: 800; font-size: 16px; text-decoration: none; box-shadow: 0 16px 32px var(--muted);">Register Now →</a>
        </div>
      </section>`,
  });

  // ── Hero 4: Floating Stats ────────────────────────────────────────────────
  bm.add('hero-floating-stats', {
    label: card(icon('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M7 21h10M12 17v4"/>'), 'Hero + Stats'),
    category: 'Hero & Headers',
    content: `
      <section data-gjs-type="hero" data-variant="stats" style="position: relative; min-height: 88vh; background: linear-gradient(135deg, var(--background) 0%, #1a1040 100%); color: var(--background); overflow: hidden; box-sizing: border-box;">
        <img src="${banner}" alt="${name}" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.25; display: block;" />
        <div style="position: relative; max-width: 1100px; margin: 0 auto; padding: 100px 24px 60px; box-sizing: border-box;">
          <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 16px 0;">${city} · ${startDate}–${endDate}</p>
          <h1 style="font-size: clamp(40px, 6vw, 68px); font-weight: 900; line-height: 1.1; max-width: 700px; margin: 0 0 20px 0; letter-spacing: -0.02em;">${name}</h1>
          <p style="font-size: 18px; color: var(--muted-foreground); max-width: 540px; margin: 0 0 40px 0; line-height: 1.7;">${tagline}</p>
          <div style="display: flex; gap: 14px; margin-bottom: 60px; flex-wrap: wrap;">
            <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 14px 32px; border-radius: 10px; font-weight: 800; font-size: 15px; text-decoration: none;">Register</a>
            <a href="#agenda" style="background: var(--border); border: 1px solid var(--border-strong, var(--muted)); color: var(--background); padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 15px; text-decoration: none; backdrop-filter: blur(8px);">View Agenda</a>
          </div>
          <div style="display: flex; gap: 16px; flex-wrap: wrap;">
            ${[['1,200+', 'Delegates'], ['85+', 'Speakers'], ['48', 'Sessions'], ['30+', 'Countries']].map(([n, l]) => `
              <div style="background: var(--bg-surface-2, var(--muted)); backdrop-filter: blur(16px); border: 1px solid var(--border-default, var(--muted)); border-radius: 16px; padding: 18px 24px; min-width: 120px; text-align: center;">
                <div style="font-size: 32px; font-weight: 900; color: var(--foreground); letter-spacing: -0.02em;">${n}</div>
                <div style="font-size: 12px; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px;">${l}</div>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });

  // ── Hero 5: Glassmorphism ─────────────────────────────────────────────────
  bm.add('hero-glass', {
    label: card(icon('<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>'), 'Hero Glass'),
    category: 'Hero & Headers',
    content: `
      <section data-gjs-type="hero" data-variant="glass" style="position: relative; min-height: 88vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--surface) 0%, var(--surface) 50%, var(--surface) 100%); color: var(--background); padding: 80px 24px; overflow: hidden; box-sizing: border-box;">
        <div style="position: absolute; top: -20%; right: -10%; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--primary) 30%, transparent) 0%, transparent 70%); pointer-events: none;"></div>
        <div style="position: absolute; bottom: -20%; left: -10%; width: 500px; height: 500px; border-radius: 50%; background: radial-gradient(circle, var(--muted) 0%, transparent 70%); pointer-events: none;"></div>
        <div style="position: relative; background: var(--bg-surface-hover, var(--muted)); backdrop-filter: blur(24px); border: 1px solid var(--border-default, var(--muted)); border-radius: 28px; padding: 60px 48px; max-width: 760px; width: 100%; text-align: center; box-shadow: 0 32px 64px var(--muted); box-sizing: border-box;">
          <div style="display: inline-flex; align-items: center; gap: 8px; background: color-mix(in srgb, var(--primary) 15%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); padding: 7px 16px; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--pri, var(--primary)); margin-bottom: 24px; text-transform: uppercase; letter-spacing: 0.08em;">
            ${startDate}–${endDate} · ${city}
          </div>
          <h1 style="font-size: clamp(36px, 5vw, 58px); font-weight: 900; margin: 0 0 16px 0; line-height: 1.1; letter-spacing: -0.02em;">${name}</h1>
          <p style="font-size: 17px; color: var(--muted-foreground); line-height: 1.7; margin: 0 0 36px 0;">${tagline}</p>
          <div style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;">
            <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 14px 32px; border-radius: 10px; font-weight: 800; font-size: 15px; text-decoration: none; box-shadow: 0 8px 20px color-mix(in srgb, var(--primary) 35%, transparent);">Register Now</a>
            <a href="#speakers" style="background: var(--border); color: var(--background); border: 1px solid var(--border-strong, var(--muted)); padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 15px; text-decoration: none;">See Speakers</a>
          </div>
        </div>
      </section>`,
  });

  // ── Hero 6: Countdown Feature ─────────────────────────────────────────────
  bm.add('hero-countdown', {
    label: card(icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'), 'Hero Countdown'),
    category: 'Hero & Headers',
    content: `
      <section data-gjs-type="hero" data-variant="countdown" style="min-height: 88vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--background) 0%, var(--background) 100%); color: var(--background); text-align: center; padding: 80px 24px; box-sizing: border-box;">
        <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 16px 0;">${city} · ${startDate}–${endDate}</p>
        <h1 style="font-size: clamp(40px, 7vw, 72px); font-weight: 900; line-height: 1.1; margin: 0 0 16px 0; letter-spacing: -0.02em;">${name}</h1>
        <p style="font-size: 20px; color: var(--muted-foreground); margin: 0 auto 48px auto; max-width: 560px; line-height: 1.6;">${tagline}</p>
        <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; margin-bottom: 48px;">
          ${[['45', 'Days'], ['12', 'Hours'], ['38', 'Min'], ['52', 'Sec']].map(([n, l]) => `
            <div style="background: var(--bg-surface-hover, var(--muted)); border: 1px solid var(--border-default, var(--muted)); border-radius: 16px; padding: 24px 28px; text-align: center; min-width: 96px;">
              <div style="font-size: 52px; font-weight: 900; color: var(--pri, var(--primary)); line-height: 1; font-variant-numeric: tabular-nums;">${n}</div>
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted-foreground); margin-top: 6px;">${l}</div>
            </div>`).join('')}
        </div>
        <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 16px 40px; border-radius: 12px; font-weight: 800; font-size: 16px; text-decoration: none; box-shadow: 0 12px 28px var(--muted);">Register Before Seats Fill Up</a>
      </section>`,
  });

  // ── Hero 7: With Speakers Row ─────────────────────────────────────────────
  bm.add('hero-speakers-preview', {
    label: card(icon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'), 'Hero + Speakers'),
    category: 'Hero & Headers',
    content: `
      <section data-gjs-type="hero" data-variant="speakers" style="background: linear-gradient(135deg, var(--background) 0%, var(--background) 100%); color: var(--background); padding: 80px 24px 0; box-sizing: border-box;">
        <div style="max-width: 900px; margin: 0 auto; text-align: center; padding-bottom: 60px;">
          <div style="display: inline-flex; gap: 8px; align-items: center; background: color-mix(in srgb, var(--primary) 12%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent); padding: 7px 16px; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--pri, var(--primary)); margin-bottom: 24px; text-transform: uppercase; letter-spacing: 0.08em;">${startDate}–${endDate} · ${city}</div>
          <h1 style="font-size: clamp(40px, 6vw, 68px); font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; letter-spacing: -0.02em;">${name}</h1>
          <p style="font-size: 18px; color: var(--muted-foreground); margin: 0 auto 36px auto; max-width: 620px; line-height: 1.65;">${tagline}</p>
          <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 15px 36px; border-radius: 10px; font-weight: 800; font-size: 15px; text-decoration: none; box-shadow: 0 12px 28px color-mix(in srgb, var(--primary) 35%, transparent);">Register Now</a>
        </div>
        <div style="background: var(--muted); border-top: 1px solid var(--border-subtle, var(--muted)); backdrop-filter: blur(8px); padding: 20px 24px; display: flex; align-items: center; gap: 20px; justify-content: center; flex-wrap: wrap; box-sizing: border-box;">
          <span style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted-foreground);">Featured Speakers</span>
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: center;">
            ${(s?.speakers?.slice(0, 5) || [
              { name: 'Dr. Sarah Chen', designation: 'Keynote Speaker', photo: '' },
              { name: 'Prof. James Park', designation: 'AI Researcher', photo: '' },
              { name: 'Elena Rostova', designation: 'CTO, TechCorp', photo: '' },
            ]).map((sp: { name: string; designation?: string; photo?: string }, i: number) => `
              <div style="display: flex; align-items: center; gap: 8px; background: var(--bg-surface-hover, var(--muted)); border: 1px solid var(--border); padding: 8px 14px; border-radius: 999px;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, rgba(99,102,241,${0.4 + i * 0.1}) 0%, var(--muted) 100%); flex-shrink: 0; overflow: hidden;">${sp.photo ? `<img src="${sp.photo}" alt="${sp.name}" style="width: 100%; height: 100%; object-fit: cover;" />` : ''}</div>
                <div>
                  <div style="font-size: 13px; font-weight: 700; color: var(--foreground);">${sp.name}</div>
                  <div style="font-size: 11px; color: var(--muted-foreground);">${'designation' in sp ? (sp as any).designation : (sp as any).role || ''}</div>
                </div>
              </div>`).join('')}
          </div>
          <a href="#speakers" style="font-size: 13px; font-weight: 700; color: var(--pri, var(--primary)); text-decoration: none;">See All →</a>
        </div>
      </section>`,
  });

  // ── Hero 8: Academic / Conference ─────────────────────────────────────────
  bm.add('hero-academic', {
    label: card(icon('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'), 'Hero Academic'),
    category: 'Hero & Headers',
    content: `
      <section data-gjs-type="hero" data-variant="academic" style="background: var(--surface); border-bottom: 4px solid var(--pri, var(--primary)); padding: 60px 40px; box-sizing: border-box; position: relative; overflow: hidden;">
        <div style="position: absolute; top: 0; right: 0; width: 300px; height: 300px; background: radial-gradient(circle at 100% 0%, var(--muted) 0%, transparent 70%);"></div>
        <div style="max-width: 1100px; margin: 0 auto; display: flex; gap: 40px; align-items: center; flex-wrap: wrap; position: relative;">
          <div style="flex: 1; min-width: 280px;">
            <div style="display: inline-block; background: var(--pri, var(--primary)); color: var(--background); padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 16px;">International Conference</div>
            <h1 style="font-size: clamp(28px, 4vw, 48px); font-weight: 900; color: var(--foreground); line-height: 1.15; margin: 0 0 12px 0;">${name}</h1>
            <p style="font-size: 16px; color: var(--muted-foreground); line-height: 1.65; margin: 0 0 24px 0; max-width: 520px;">${tagline}</p>
            <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 28px; flex-wrap: wrap;">
              <span style="display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--muted-foreground); font-weight: 600;">📅 ${startDate}–${endDate}</span>
              <span style="display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--muted-foreground); font-weight: 600;">📍 ${city}</span>
            </div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; text-decoration: none;">Register Now</a>
              <a href="#cfp" style="background: var(--foreground); color: var(--foreground); border: 2px solid var(--foreground); padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none;">Submit Abstract</a>
            </div>
          </div>
          <div style="flex: 0 0 auto; background: var(--background); border: 2px solid var(--foreground); border-radius: 16px; padding: 24px 28px; min-width: 220px; box-shadow: 0 4px 16px var(--muted);">
            <p style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted-foreground); margin: 0 0 16px 0;">Key Dates</p>
            ${(s?.importantDates?.slice(0, 3) || [
              { label: 'Abstract Submission', date: '2026-08-31' },
              { label: 'Early Bird Registration', date: '2026-09-15' },
              { label: 'Conference Begins', date: '2026-10-24' },
            ]).map((d: { label: string; date: string }) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--foreground);">
                <span style="font-size: 13px; color: var(--foreground); font-weight: 500;">${d.label}</span>
                <span style="font-size: 13px; font-weight: 700; color: var(--foreground);">${new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });
}
