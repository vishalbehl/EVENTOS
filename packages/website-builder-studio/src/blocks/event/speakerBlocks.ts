import type { Editor } from 'grapesjs';
import type { EventDataSnapshot } from '../../types';

const icon = (paths: string) => `<svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const card = (svg: string, label: string) => `<div class="gjs-block-custom"><div class="gjs-block-icon-wrapper">${svg}</div><div class="gjs-block-label">${label}</div></div>`;

export function registerSpeakerBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;
  const speakers = s?.speakers?.length ? s.speakers : [
    { id: '1', name: 'Dr. Sarah Chen', designation: 'Professor of AI', organization: 'MIT', speakerType: 'KEYNOTE' as const, photo: '', talkTitle: 'The Future of Machine Intelligence' },
    { id: '2', name: 'Prof. James Park', designation: 'Director of Research', organization: 'Stanford University', speakerType: 'KEYNOTE' as const, photo: '', talkTitle: 'Quantum Computing Horizons' },
    { id: '3', name: 'Elena Rostova', designation: 'Chief Technology Officer', organization: 'NovaTech', speakerType: 'INVITED' as const, photo: '', talkTitle: 'Scaling AI in Enterprise' },
    { id: '4', name: 'Dr. Ravi Shankar', designation: 'Lead Data Scientist', organization: 'DeepMind', speakerType: 'INVITED' as const, photo: '', talkTitle: 'Neural Architecture Search' },
    { id: '5', name: 'Maria Gonzalez', designation: 'VP Engineering', organization: 'Anthropic', speakerType: 'REGULAR' as const, photo: '', talkTitle: 'Safe AI Development' },
    { id: '6', name: 'Dr. Wei Zhang', designation: 'Professor', organization: 'Tsinghua University', speakerType: 'REGULAR' as const, photo: '', talkTitle: 'Cross-modal Learning' },
  ];

  const speakerCard = (sp: typeof speakers[0], size: 'normal' | 'large' = 'normal') => {
    const isLarge = size === 'large';
    const avatarSize = isLarge ? 80 : 64;
    return `
      <div style="background: var(--muted); border: 1px solid var(--border); border-radius: ${isLarge ? 20 : 16}px; padding: ${isLarge ? 28 : 20}px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; transition: all 0.2s; cursor: pointer; box-sizing: border-box;">
        <div style="width: ${avatarSize}px; height: ${avatarSize}px; border-radius: 50%; background: linear-gradient(135deg, var(--muted), var(--muted)); display: flex; align-items: center; justify-content: center; font-size: ${isLarge ? 28 : 22}px; font-weight: 900; color: var(--foreground); flex-shrink: 0; overflow: hidden; border: 2px solid var(--border-default, var(--muted));">${sp.photo ? `<img src="${sp.photo}" alt="${sp.name}" style="width: 100%; height: 100%; object-fit: cover;" />` : sp.name.charAt(0)}</div>
        ${sp.speakerType === 'KEYNOTE' ? `<span style="background: linear-gradient(135deg, var(--pri, var(--primary)), var(--primary)); color: var(--background); padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;">Keynote</span>` : ''}
        <div>
          <div style="font-size: ${isLarge ? 18 : 15}px; font-weight: 800; color: var(--foreground); margin-bottom: 4px;">${sp.name}</div>
          <div style="font-size: 13px; color: var(--muted-foreground); line-height: 1.4;">${sp.designation}</div>
          ${sp.organization ? `<div style="font-size: 12px; color: var(--muted-foreground); margin-top: 2px;">${sp.organization}</div>` : ''}
        </div>
        ${sp.talkTitle ? `<div style="font-size: 12px; color: var(--pri, var(--primary)); background: color-mix(in srgb, var(--primary) 10%, transparent); padding: 6px 12px; border-radius: 6px; font-weight: 600; line-height: 1.4;">"${sp.talkTitle}"</div>` : ''}
      </div>`;
  };

  // ── Variant 1: 3-Column Grid ──────────────────────────────────────────────
  bm.add('speakers-grid-3col', {
    label: card(icon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'), 'Speaker Grid 3col'),
    category: 'Speakers & Committee',
    content: `
      <section data-gjs-type="speaker-grid" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1100px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 56px;">
            <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">World-Class Experts</p>
            <h2 style="font-size: 42px; font-weight: 900; color: var(--foreground); margin: 0 0 12px 0; letter-spacing: -0.02em;">Keynote Speakers</h2>
            <p style="font-size: 17px; color: var(--muted-foreground); max-width: 520px; margin: 0 auto; line-height: 1.65;">Learn from the brightest minds shaping the future of technology and innovation.</p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
            ${speakers.map(sp => speakerCard(sp)).join('')}
          </div>
          <div style="text-align: center; margin-top: 40px;">
            <a href="#all-speakers" style="display: inline-flex; align-items: center; gap: 8px; background: var(--bg-surface-2, var(--muted)); border: 1px solid var(--muted); color: var(--foreground); padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; text-decoration: none;">View All Speakers →</a>
          </div>
        </div>
      </section>`,
  });

  // ── Variant 2: 4-Column Grid ──────────────────────────────────────────────
  bm.add('speakers-grid-4col', {
    label: card(icon('<circle cx="9" cy="7" r="4"/><path d="M17 21v-2a4 4 0 0 0-4-4H5"/><circle cx="17" cy="7" r="4"/>'), 'Speaker Grid 4col'),
    category: 'Speakers & Committee',
    content: `
      <section data-gjs-type="speaker-grid" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1100px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 48px;">
            <h2 style="font-size: 38px; font-weight: 900; color: var(--foreground); margin: 0 0 8px 0; letter-spacing: -0.02em;">Our Speakers</h2>
            <p style="font-size: 16px; color: var(--muted-foreground);">Experts from leading institutions and companies worldwide</p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px;">
            ${speakers.map(sp => `
              <div style="background: var(--muted); border: 1px solid var(--muted); border-radius: 14px; padding: 20px 16px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; box-sizing: border-box;">
                <div style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 30%, transparent), var(--muted)); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; color: var(--background); overflow: hidden;">${sp.photo ? `<img src="${sp.photo}" alt="${sp.name}" style="width: 100%; height: 100%; object-fit: cover;" />` : sp.name.charAt(0)}</div>
                <div>
                  <div style="font-size: 14px; font-weight: 700; color: var(--foreground);">${sp.name}</div>
                  <div style="font-size: 12px; color: var(--muted-foreground); margin-top: 2px;">${sp.designation}</div>
                  ${sp.organization ? `<div style="font-size: 11px; color: var(--muted-foreground);">${sp.organization}</div>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });

  // ── Variant 3: Featured Keynote ───────────────────────────────────────────
  bm.add('speakers-featured', {
    label: card(icon('<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/><path d="M12 11v10"/>'), 'Featured Speaker'),
    category: 'Speakers & Committee',
    content: `
      <section data-gjs-type="speaker-grid" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1000px; margin: 0 auto;">
          <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 32px 0; text-align: center;">Featured Keynote</p>
          <div style="background: var(--muted); border: 1px solid var(--muted); border-radius: 24px; padding: 48px; display: flex; gap: 48px; align-items: center; flex-wrap: wrap; box-sizing: border-box;">
            <div style="width: 160px; height: 160px; border-radius: 50%; background: linear-gradient(135deg, var(--muted), var(--muted)); display: flex; align-items: center; justify-content: center; font-size: 56px; font-weight: 900; color: var(--background); flex-shrink: 0; border: 3px solid var(--muted); overflow: hidden;">${speakers[0].photo ? `<img src="${speakers[0].photo}" alt="${speakers[0].name}" style="width: 100%; height: 100%; object-fit: cover;" />` : speakers[0].name.charAt(0)}</div>
            <div style="flex: 1; min-width: 240px;">
              <span style="background: linear-gradient(135deg, var(--pri, var(--primary)), var(--primary)); color: var(--background); padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;">Keynote Speaker</span>
              <h2 style="font-size: 36px; font-weight: 900; color: var(--foreground); margin: 16px 0 6px 0; letter-spacing: -0.02em;">${speakers[0].name}</h2>
              <p style="font-size: 16px; color: var(--muted-foreground); margin: 0 0 4px 0;">${speakers[0].designation}</p>
              ${speakers[0].organization ? `<p style="font-size: 14px; color: var(--muted-foreground); margin: 0 0 20px 0;">${speakers[0].organization}</p>` : ''}
              ${speakers[0].talkTitle ? `<div style="background: color-mix(in srgb, var(--primary) 10%, transparent); border-left: 3px solid var(--pri, var(--primary)); padding: 12px 16px; border-radius: 0 8px 8px 0; font-size: 15px; font-style: italic; color: var(--foreground);">"${speakers[0].talkTitle}"</div>` : ''}
            </div>
          </div>
          ${speakers.length > 1 ? `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-top: 24px;">
              ${speakers.slice(1, 5).map(sp => speakerCard(sp)).join('')}
            </div>` : ''}
        </div>
      </section>`,
  });

  // ── Variant 4: List Layout ────────────────────────────────────────────────
  bm.add('speakers-list', {
    label: card(icon('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'), 'Speaker List'),
    category: 'Speakers & Committee',
    content: `
      <section data-gjs-type="speaker-grid" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 800px; margin: 0 auto;">
          <h2 style="font-size: 36px; font-weight: 900; color: var(--foreground); margin: 0 0 40px 0; letter-spacing: -0.02em; text-align: center;">All Speakers</h2>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${speakers.map(sp => `
              <div style="display: flex; align-items: center; gap: 20px; background: var(--muted); border: 1px solid var(--muted); border-radius: 14px; padding: 16px 20px; box-sizing: border-box; transition: all 0.2s;">
                <div style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 35%, transparent), var(--muted)); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; color: var(--background); flex-shrink: 0; overflow: hidden;">${sp.photo ? `<img src="${sp.photo}" alt="${sp.name}" style="width: 100%; height: 100%; object-fit: cover;" />` : sp.name.charAt(0)}</div>
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span style="font-size: 15px; font-weight: 700; color: var(--foreground);">${sp.name}</span>
                    ${sp.speakerType === 'KEYNOTE' ? `<span style="background: var(--muted); color: var(--pri, var(--primary)); padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase;">Keynote</span>` : ''}
                  </div>
                  <div style="font-size: 13px; color: var(--muted-foreground); margin-top: 2px;">${sp.designation}${sp.organization ? ` · ${sp.organization}` : ''}</div>
                  ${sp.talkTitle ? `<div style="font-size: 12px; color: var(--muted-foreground); margin-top: 4px; font-style: italic;">"${sp.talkTitle}"</div>` : ''}
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" stroke-width="2" style="width: 18px; height: 18px; flex-shrink: 0;"><polyline points="9 18 15 12 9 6"/></svg>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });

  // ── Variant 5: Spotlight Alternating ─────────────────────────────────────
  bm.add('speakers-spotlight', {
    label: card(icon('<circle cx="12" cy="7" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>'), 'Speaker Spotlight'),
    category: 'Speakers & Committee',
    content: `
      <section data-gjs-type="speaker-grid" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1000px; margin: 0 auto;">
          <h2 style="font-size: 38px; font-weight: 900; color: var(--foreground); margin: 0 0 64px 0; text-align: center; letter-spacing: -0.02em;">Spotlight Speakers</h2>
          <div style="display: flex; flex-direction: column; gap: 60px;">
            ${speakers.slice(0, 3).map((sp, i) => `
              <div style="display: flex; gap: 48px; align-items: center; flex-wrap: wrap; ${i % 2 === 1 ? 'flex-direction: row-reverse;' : ''}">
                <div style="width: 200px; height: 200px; border-radius: 24px; background: linear-gradient(135deg, rgba(99,102,241,${0.3 + i * 0.1}), var(--muted)); display: flex; align-items: center; justify-content: center; font-size: 64px; font-weight: 900; color: var(--background); flex-shrink: 0; overflow: hidden; border: 1px solid var(--border-default, var(--muted));">${sp.photo ? `<img src="${sp.photo}" alt="${sp.name}" style="width: 100%; height: 100%; object-fit: cover;" />` : sp.name.charAt(0)}</div>
                <div style="flex: 1; min-width: 240px;">
                  ${sp.speakerType === 'KEYNOTE' ? `<span style="background: linear-gradient(135deg, var(--pri, var(--primary)), var(--primary)); color: var(--background); padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase;">Keynote</span>` : `<span style="background: var(--border); color: var(--muted-foreground); padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase;">Invited Speaker</span>`}
                  <h3 style="font-size: 30px; font-weight: 900; color: var(--foreground); margin: 14px 0 6px 0; letter-spacing: -0.02em;">${sp.name}</h3>
                  <p style="font-size: 15px; color: var(--muted-foreground); margin: 0 0 4px 0;">${sp.designation}</p>
                  ${sp.organization ? `<p style="font-size: 14px; color: var(--muted-foreground); margin: 0 0 16px 0;">${sp.organization}</p>` : '<div style="margin-bottom: 16px;"></div>'}
                  ${sp.talkTitle ? `<blockquote style="border-left: 3px solid var(--pri, var(--primary)); padding: 10px 16px; margin: 0; background: var(--muted); border-radius: 0 8px 8px 0; font-size: 15px; font-style: italic; color: var(--foreground); line-height: 1.6;">"${sp.talkTitle}"</blockquote>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });
}
