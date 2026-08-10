import type { Editor } from 'grapesjs';
import type { EventDataBindings } from '../types';

export function registerEventBlocks(editor: Editor, eventData?: EventDataBindings) {
  const blockManager = editor.BlockManager;

  const eventName = eventData?.eventName || 'Global Tech Summit 2026';
  const eventDates = eventData?.eventDates || 'October 24 - 26, 2026';
  const venueName = eventData?.venueName || 'Grand Convention Center';
  const location = eventData?.location || 'San Francisco, CA';

  // ── Category: Basic Layouts ──────────────────────────────
  blockManager.add('column-1', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        </div>
        <div class="gjs-block-label">1 Column</div>
      </div>
    `,
    category: 'Basic',
    content: `<div style="padding: 20px; display: flex; flex-direction: column; gap: 12px; min-height: 80px;"></div>`,
  });

  blockManager.add('column-2', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="8" height="18" rx="2" />
            <rect x="13" y="3" width="8" height="18" rx="2" />
          </svg>
        </div>
        <div class="gjs-block-label">2 Columns</div>
      </div>
    `,
    category: 'Basic',
    content: `
      <div style="display: flex; gap: 20px; padding: 20px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 250px; min-height: 80px; padding: 16px; border: 1px dashed var(--border-strong, var(--muted)); border-radius: 8px;"></div>
        <div style="flex: 1; min-width: 250px; min-height: 80px; padding: 16px; border: 1px dashed var(--border-strong, var(--muted)); border-radius: 8px;"></div>
      </div>
    `,
  });

  blockManager.add('column-3', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="5" height="18" rx="1" />
            <rect x="9.5" y="3" width="5" height="18" rx="1" />
            <rect x="17" y="3" width="5" height="18" rx="1" />
          </svg>
        </div>
        <div class="gjs-block-label">3 Columns</div>
      </div>
    `,
    category: 'Basic',
    content: `
      <div style="display: flex; gap: 20px; padding: 20px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 200px; min-height: 80px; padding: 16px; border: 1px dashed var(--border-strong, var(--muted)); border-radius: 8px;"></div>
        <div style="flex: 1; min-width: 200px; min-height: 80px; padding: 16px; border: 1px dashed var(--border-strong, var(--muted)); border-radius: 8px;"></div>
        <div style="flex: 1; min-width: 200px; min-height: 80px; padding: 16px; border: 1px dashed var(--border-strong, var(--muted)); border-radius: 8px;"></div>
      </div>
    `,
  });

  blockManager.add('text-block', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 7V4h16v3M9 20h6M12 4v16" />
          </svg>
        </div>
        <div class="gjs-block-label">Text</div>
      </div>
    `,
    category: 'Basic',
    content: `<p style="font-size: 16px; line-height: 1.6; color: var(--muted-foreground); margin: 0 0 12px 0;">Insert your custom text description here.</p>`,
  });

  blockManager.add('link-block', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </div>
        <div class="gjs-block-label">Link</div>
      </div>
    `,
    category: 'Basic',
    content: `<a href="#" style="color: var(--pri, var(--primary)); font-weight: 600; text-decoration: underline;">Clickable Link Text</a>`,
  });

  blockManager.add('image-block', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <div class="gjs-block-label">Image</div>
      </div>
    `,
    category: 'Basic',
    content: `<img src="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800" alt="Image" style="width: 100%; height: auto; border-radius: 12px; object-fit: cover;" />`,
  });

  blockManager.add('video-block', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <polygon points="10 8 16 12 10 16 10 8" />
          </svg>
        </div>
        <div class="gjs-block-label">Video</div>
      </div>
    `,
    category: 'Basic',
    content: `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" style="width: 100%; height: 360px; border-radius: 12px; border: none;"></iframe>`,
  });

  // ── Category: Forms & Inputs ─────────────────────────────
  blockManager.add('form-container', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div class="gjs-block-label">Form</div>
      </div>
    `,
    category: 'Forms',
    content: `
      <form style="display: flex; flex-direction: column; gap: 16px; padding: 24px; background: var(--muted); border: 1px solid var(--border); border-radius: 16px; max-width: 500px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--foreground);">Full Name</label>
        <input type="text" placeholder="John Doe" style="padding: 12px; border-radius: 8px; border: 1px solid var(--border-strong, var(--muted)); background: var(--bg-surface-2, var(--muted)); color: var(--foreground);" />
        <button type="submit" style="background: var(--pri, var(--primary)); color: var(--foreground); padding: 12px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer;">Submit</button>
      </form>
    `,
  });

  blockManager.add('input-field', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <line x1="7" y1="12" x2="11" y2="12" />
          </svg>
        </div>
        <div class="gjs-block-label">Input</div>
      </div>
    `,
    category: 'Forms',
    content: `<input type="text" placeholder="Enter text..." style="width: 100%; padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border-strong, var(--muted)); background: var(--bg-surface-2, var(--muted)); color: var(--foreground); font-size: 14px; box-sizing: border-box;" />`,
  });

  blockManager.add('button-element', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="6" width="20" height="12" rx="3" />
          </svg>
        </div>
        <div class="gjs-block-label">Button</div>
      </div>
    `,
    category: 'Forms',
    content: `<button style="background: var(--pri, var(--primary)); color: var(--foreground); padding: 12px 28px; border-radius: 10px; border: none; font-size: 14px; font-weight: 700; cursor: pointer; display: inline-block;">Button Text</button>`,
  });

  // ── Category: Hero & Banners ──────────────────────────────
  blockManager.add('hero-banner-glass', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M7 11h10M7 15h7" />
          </svg>
        </div>
        <div class="gjs-block-label">Hero Banner (Glass)</div>
      </div>
    `,
    category: 'Hero & Headers',
    content: `
      <section style="position: relative; min-height: 85vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--background) 0%, var(--background) 50%, var(--background) 100%); color: var(--foreground); padding: 80px 24px; text-align: center; overflow: hidden;">
        <div style="position: absolute; top: -100px; left: 50%; transform: translateX(-50%); width: 600px; height: 600px; background: radial-gradient(circle, var(--pri, var(--primary)) 0%, transparent 70%); opacity: 0.25; filter: blur(80px); pointer-events: none;"></div>
        <div style="max-width: 900px; margin: 0 auto; position: relative; z-index: 2;">
          <div style="display: inline-flex; align-items: center; gap: 8px; background: var(--border); border: 1px solid var(--border-strong, var(--muted)); padding: 8px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; color: var(--pri, var(--primary)); margin-bottom: 24px; backdrop-filter: blur(8px);">
            <span>📅 ${eventDates}</span>
            <span>•</span>
            <span>📍 ${location}</span>
          </div>
          <h1 style="font-size: 54px; font-weight: 800; line-height: 1.15; margin: 0 0 20px 0; background: linear-gradient(135deg, var(--foreground) 0%, var(--muted-foreground) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            ${eventName}
          </h1>
          <p style="font-size: 20px; color: var(--muted-foreground); max-width: 680px; margin: 0 auto 36px auto; line-height: 1.6;">
            Join world-class industry leaders, researchers, and innovators for three days of breakthrough insights, keynote sessions, and networking.
          </p>
          <div style="display: flex; gap: 16px; justify-content: center; align-items: center; flex-wrap: wrap;">
            <a href="#register" style="background: var(--pri, var(--primary)); color: var(--foreground); padding: 16px 36px; border-radius: 12px; font-weight: 700; font-size: 16px; text-decoration: none; box-shadow: 0 10px 25px rgba(99, 102, 241, 0.4); transition: transform 0.2s;">
              Register Now
            </a>
            <a href="#agenda" style="background: var(--border-subtle, var(--muted)); color: var(--foreground); border: 1px solid var(--border-strong, var(--muted)); padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 16px; text-decoration: none; backdrop-filter: blur(8px);">
              View Agenda
            </a>
          </div>
        </div>
      </section>
    `,
  });

  // Category: Key Statistics
  blockManager.add('event-stats-grid', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <div class="gjs-block-label">Event Statistics</div>
      </div>
    `,
    category: 'Overview & Stats',
    content: `
      <section style="padding: 60px 24px; background: var(--background); color: var(--foreground);">
        <div style="max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px;">
          <div style="background: var(--muted); border: 1px solid var(--border); padding: 32px 24px; border-radius: 16px; text-align: center;">
            <div style="font-size: 44px; font-weight: 800; color: var(--pri, var(--primary)); margin-bottom: 4px;">1,200+</div>
            <div style="font-size: 15px; color: var(--muted-foreground); font-weight: 500;">Attending Delegates</div>
          </div>
          <div style="background: var(--muted); border: 1px solid var(--border); padding: 32px 24px; border-radius: 16px; text-align: center;">
            <div style="font-size: 44px; font-weight: 800; color: var(--secondary); margin-bottom: 4px;">45+</div>
            <div style="font-size: 15px; color: var(--muted-foreground); font-weight: 500;">Keynote Speakers</div>
          </div>
          <div style="background: var(--muted); border: 1px solid var(--border); padding: 32px 24px; border-radius: 16px; text-align: center;">
            <div style="font-size: 44px; font-weight: 800; color: var(--pri, var(--primary)); margin-bottom: 4px;">24</div>
            <div style="font-size: 15px; color: var(--muted-foreground); font-weight: 500;">Technical Sessions</div>
          </div>
          <div style="background: var(--muted); border: 1px solid var(--border); padding: 32px 24px; border-radius: 16px; text-align: center;">
            <div style="font-size: 44px; font-weight: 800; color: var(--secondary); margin-bottom: 4px;">30+</div>
            <div style="font-size: 15px; color: var(--muted-foreground); font-weight: 500;">Global Sponsors</div>
          </div>
        </div>
      </section>
    `,
  });

  // Category: Speakers
  blockManager.add('speaker-grid-cards', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          </svg>
        </div>
        <div class="gjs-block-label">Speaker Grid</div>
      </div>
    `,
    category: 'Speakers & Program',
    content: `
      <section style="padding: 80px 24px; background: var(--card); color: var(--foreground);">
        <div style="max-width: 1100px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 56px;">
            <h2 style="font-size: 38px; font-weight: 800; margin: 0 0 12px 0;">Featured Keynote Speakers</h2>
            <p style="font-size: 18px; color: var(--muted-foreground); margin: 0;">Learn directly from visionaries pioneering future technology.</p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 28px;">
            <!-- Speaker Card 1 -->
            <div style="background: var(--muted); border: 1px solid var(--border); border-radius: 20px; padding: 24px; text-align: center;">
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300" alt="Speaker" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; margin: 0 auto 16px auto; border: 3px solid var(--pri, var(--primary));" />
              <h3 style="font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">Dr. Elena Rostova</h3>
              <p style="font-size: 14px; color: var(--pri, var(--primary)); font-weight: 600; margin: 0 0 12px 0;">Chief AI Scientist • Neural Systems</p>
              <p style="font-size: 13px; color: var(--muted-foreground); line-height: 1.5; margin: 0;">Keynote: Next-Generation Autonomous Intelligence</p>
            </div>
            <!-- Speaker Card 2 -->
            <div style="background: var(--muted); border: 1px solid var(--border); border-radius: 20px; padding: 24px; text-align: center;">
              <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300" alt="Speaker" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; margin: 0 auto 16px auto; border: 3px solid var(--pri, var(--primary));" />
              <h3 style="font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">Marcus Vance</h3>
              <p style="font-size: 14px; color: var(--pri, var(--primary)); font-weight: 600; margin: 0 0 12px 0;">VP of Engineering • Cloud Scale</p>
              <p style="font-size: 13px; color: var(--muted-foreground); line-height: 1.5; margin: 0;">Keynote: Distributed Architecture at Massive Scale</p>
            </div>
            <!-- Speaker Card 3 -->
            <div style="background: var(--muted); border: 1px solid var(--border); border-radius: 20px; padding: 24px; text-align: center;">
              <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300" alt="Speaker" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; margin: 0 auto 16px auto; border: 3px solid var(--pri, var(--primary));" />
              <h3 style="font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">Sophia Chen</h3>
              <p style="font-size: 14px; color: var(--pri, var(--primary)); font-weight: 600; margin: 0 0 12px 0;">Head of Product • Quantum Labs</p>
              <p style="font-size: 13px; color: var(--muted-foreground); line-height: 1.5; margin: 0;">Keynote: Designing Human-Centered Quantum Interfaces</p>
            </div>
          </div>
        </div>
      </section>
    `,
  });

  // Category: Agenda Timeline
  blockManager.add('agenda-timeline-list', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <div class="gjs-block-label">Agenda Timeline</div>
      </div>
    `,
    category: 'Speakers & Program',
    content: `
      <section id="agenda" style="padding: 80px 24px; background: var(--background); color: var(--foreground);">
        <div style="max-width: 900px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 48px;">
            <h2 style="font-size: 38px; font-weight: 800; margin: 0 0 12px 0;">Schedule & Agenda</h2>
            <p style="font-size: 18px; color: var(--muted-foreground); margin: 0;">Explore high-impact sessions across multi-track stages.</p>
          </div>
          <!-- Agenda Item 1 -->
          <div style="display: flex; gap: 24px; background: var(--muted); border: 1px solid var(--border); padding: 24px; border-radius: 16px; margin-bottom: 16px; align-items: center; flex-wrap: wrap;">
            <div style="min-width: 120px; font-weight: 800; font-size: 18px; color: var(--pri, var(--primary));">09:00 - 10:00 AM</div>
            <div style="flex: 1;">
              <h4 style="font-size: 18px; font-weight: 700; margin: 0 0 4px 0;">Welcome & Opening Keynote</h4>
              <p style="font-size: 14px; color: var(--muted-foreground); margin: 0;">Grand Auditorium • Main Stage</p>
            </div>
            <span style="background: var(--muted); color: var(--pri, var(--primary)); padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 700;">Keynote</span>
          </div>
          <!-- Agenda Item 2 -->
          <div style="display: flex; gap: 24px; background: var(--muted); border: 1px solid var(--border); padding: 24px; border-radius: 16px; margin-bottom: 16px; align-items: center; flex-wrap: wrap;">
            <div style="min-width: 120px; font-weight: 800; font-size: 18px; color: var(--pri, var(--primary));">10:30 - 12:00 PM</div>
            <div style="flex: 1;">
              <h4 style="font-size: 18px; font-weight: 700; margin: 0 0 4px 0;">AI & Enterprise Transformation Panel</h4>
              <p style="font-size: 14px; color: var(--muted-foreground); margin: 0;">Hall B • Technical Track</p>
            </div>
            <span style="background: var(--muted); color: var(--secondary); padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 700;">Panel</span>
          </div>
        </div>
      </section>
    `,
  });

  // Category: Sponsors
  blockManager.add('sponsor-wall-logos', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v12M6 12h12" />
          </svg>
        </div>
        <div class="gjs-block-label">Sponsors Wall</div>
      </div>
    `,
    category: 'Sponsors & Partners',
    content: `
      <section style="padding: 70px 24px; background: var(--card); color: var(--foreground); text-align: center;">
        <div style="max-width: 1000px; margin: 0 auto;">
          <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin-bottom: 32px;">
            Supported by Leading Global Organizations
          </h3>
          <div style="display: flex; justify-content: center; align-items: center; gap: 40px; flex-wrap: wrap; opacity: 0.85;">
            <div style="font-size: 22px; font-weight: 900; letter-spacing: -0.02em; color: var(--foreground);">PLATINUM TECH</div>
            <div style="font-size: 22px; font-weight: 900; letter-spacing: -0.02em; color: var(--foreground);">CLOUD MATRIX</div>
            <div style="font-size: 22px; font-weight: 900; letter-spacing: -0.02em; color: var(--foreground);">QUANTUM LABS</div>
            <div style="font-size: 22px; font-weight: 900; letter-spacing: -0.02em; color: var(--foreground);">NEXUS GLOBAL</div>
          </div>
        </div>
      </section>
    `,
  });

  // Category: Registration CTA
  blockManager.add('registration-pricing-tiers', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        </div>
        <div class="gjs-block-label">Ticket Passes</div>
      </div>
    `,
    category: 'Tickets & Registration',
    content: `
      <section id="register" style="padding: 80px 24px; background: var(--background); color: var(--foreground);">
        <div style="max-width: 1100px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 56px;">
            <h2 style="font-size: 38px; font-weight: 800; margin: 0 0 12px 0;">Reserve Your Seat</h2>
            <p style="font-size: 18px; color: var(--muted-foreground); margin: 0;">Choose the delegate pass that fits your event experience.</p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 28px;">
            <!-- Tier 1 -->
            <div style="background: var(--muted); border: 1px solid var(--border); padding: 32px; border-radius: 20px;">
              <h3 style="font-size: 22px; font-weight: 700; margin: 0 0 8px 0;">Academic Delegate</h3>
              <p style="font-size: 14px; color: var(--muted-foreground); margin: 0 0 20px 0;">Full access for students and academic researchers.</p>
              <div style="font-size: 42px; font-weight: 800; margin-bottom: 24px;">$199 <span style="font-size: 15px; color: var(--muted-foreground); font-weight: 400;">/ pass</span></div>
              <a href="#" style="display: block; width: 100%; text-align: center; background: var(--border); color: var(--foreground); padding: 14px; border-radius: 10px; font-weight: 700; text-decoration: none;">Select Pass</a>
            </div>
            <!-- Tier 2 (Highlighted) -->
            <div style="background: color-mix(in srgb, var(--primary) 12%, transparent); border: 2px solid var(--pri, var(--primary)); padding: 32px; border-radius: 20px; position: relative;">
              <div style="position: absolute; top: -14px; right: 24px; background: var(--pri, var(--primary)); color: var(--foreground); font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 4px 12px; border-radius: 999px;">Most Popular</div>
              <h3 style="font-size: 22px; font-weight: 700; margin: 0 0 8px 0;">Standard Professional</h3>
              <p style="font-size: 14px; color: var(--muted-foreground); margin: 0 0 20px 0;">Access to all sessions, networking lounge & proceedings.</p>
              <div style="font-size: 42px; font-weight: 800; color: var(--pri, var(--primary)); margin-bottom: 24px;">$399 <span style="font-size: 15px; color: var(--muted-foreground); font-weight: 400;">/ pass</span></div>
              <a href="#" style="display: block; width: 100%; text-align: center; background: var(--pri, var(--primary)); color: var(--foreground); padding: 14px; border-radius: 10px; font-weight: 700; text-decoration: none;">Register Standard Pass</a>
            </div>
          </div>
        </div>
      </section>
    `,
  });

  // Category: Venue & Footer
  blockManager.add('venue-location-card', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div class="gjs-block-label">Venue & Location</div>
      </div>
    `,
    category: 'Venue & Contact',
    content: `
      <section style="padding: 80px 24px; background: var(--card); color: var(--foreground);">
        <div style="max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 36px; align-items: center;">
          <div>
            <h2 style="font-size: 36px; font-weight: 800; margin: 0 0 16px 0;">Venue & Accommodations</h2>
            <p style="font-size: 18px; font-weight: 700; color: var(--pri, var(--primary)); margin: 0 0 8px 0;">${venueName}</p>
            <p style="font-size: 16px; color: var(--muted-foreground); line-height: 1.6; margin: 0 0 24px 0;">${location}</p>
            <p style="font-size: 14px; color: var(--muted-foreground); line-height: 1.5;">Conveniently located 15 minutes from international airport with partner hotel accommodations available.</p>
          </div>
          <div style="background: var(--muted); border: 1px solid var(--border); height: 260px; border-radius: 20px; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground); font-weight: 600;">
            📍 Interactive Map Container Placeholder
          </div>
        </div>
      </section>
    `,
  });

  blockManager.add('event-footer-simple', {
    label: `
      <div class="gjs-block-custom">
        <div class="gjs-block-icon-wrapper">
          <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="10" rx="2" />
          </svg>
        </div>
        <div class="gjs-block-label">Event Footer</div>
      </div>
    `,
    category: 'Venue & Contact',
    content: `
      <footer style="padding: 40px 24px; background: var(--surface); border-top: 1px solid var(--border); color: var(--muted-foreground); text-align: center; font-size: 14px;">
        <div style="max-width: 1000px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>© 2026 ${eventName}. Powered by Eventos Platform.</div>
          <div style="display: flex; gap: 20px;">
            <a href="#" style="color: var(--muted-foreground); text-decoration: none;">Privacy Policy</a>
            <a href="#" style="color: var(--muted-foreground); text-decoration: none;">Terms of Service</a>
            <a href="#" style="color: var(--muted-foreground); text-decoration: none;">Contact Support</a>
          </div>
        </div>
      </footer>
    `,
  });
}
