import type { Editor } from 'grapesjs';
import type { EventDataSnapshot } from '../../types';

const icon = (paths: string) => `<svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const card = (svg: string, label: string) => `<div class="gjs-block-custom"><div class="gjs-block-icon-wrapper">${svg}</div><div class="gjs-block-label">${label}</div></div>`;

export function registerAgendaBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;

  const days = s?.sessions?.length ? (() => {
    const dayMap = new Map<string, NonNullable<EventDataSnapshot['sessions']>>();
    s.sessions!.forEach(sess => {
      const arr = dayMap.get(sess.date) || [];
      arr.push(sess);
      dayMap.set(sess.date, arr);
    });
    return Array.from(dayMap.entries()).map(([date, sessions]) => ({ date, sessions: sessions! }));
  })() : [
    {
      date: '2026-10-24',
      sessions: [
        { id: '1', date: '2026-10-24', startTime: '09:00', endTime: '09:30', title: 'Registration & Welcome Coffee', sessionType: 'BREAK' as const, room: 'Main Lobby', chair: '', speakerIds: [], track: '' },
        { id: '2', date: '2026-10-24', startTime: '09:30', endTime: '10:30', title: 'Opening Keynote: The State of AI in 2026', sessionType: 'KEYNOTE' as const, room: 'Grand Hall A', chair: 'Dr. Sarah Chen', speakerIds: ['1'], track: 'AI & ML' },
        { id: '3', date: '2026-10-24', startTime: '10:45', endTime: '11:30', title: 'Quantum Computing in Practice', sessionType: 'TALK' as const, room: 'Hall B', chair: '', speakerIds: ['2'], track: 'Computing' },
        { id: '4', date: '2026-10-24', startTime: '11:30', endTime: '12:30', title: 'Panel: The Responsible AI Frontier', sessionType: 'PANEL' as const, room: 'Grand Hall A', chair: 'Prof. James Park', speakerIds: ['1', '2', '3'], track: 'AI & ML' },
        { id: '5', date: '2026-10-24', startTime: '12:30', endTime: '14:00', title: 'Networking Lunch', sessionType: 'BREAK' as const, room: 'Exhibition Hall', chair: '', speakerIds: [], track: '' },
      ],
    },
    {
      date: '2026-10-25',
      sessions: [
        { id: '6', date: '2026-10-25', startTime: '09:00', endTime: '10:00', title: 'Keynote: Edge AI and the Future of Compute', sessionType: 'KEYNOTE' as const, room: 'Grand Hall A', chair: '', speakerIds: ['4'], track: 'Computing' },
        { id: '7', date: '2026-10-25', startTime: '10:15', endTime: '11:00', title: 'Workshop: Building RAG Pipelines', sessionType: 'WORKSHOP' as const, room: 'Workshop Room 1', chair: 'Elena Rostova', speakerIds: ['3'], track: 'AI & ML' },
        { id: '8', date: '2026-10-25', startTime: '11:15', endTime: '12:15', title: 'Open Research Submissions Showcase', sessionType: 'POSTER' as const, room: 'Poster Hall', chair: '', speakerIds: [], track: 'Research' },
      ],
    },
  ];

  const sessionTypeBadge: Record<string, string> = {
    KEYNOTE: 'background: linear-gradient(135deg, var(--primary), var(--primary)); color: var(--background);',
    PANEL: 'background: var(--muted); color: var(--foreground); border: 1px solid var(--muted);',
    TALK: 'background: color-mix(in srgb, var(--primary) 15%, transparent); color: var(--primary); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);',
    WORKSHOP: 'background: var(--muted); color: var(--success); border: 1px solid var(--muted);',
    POSTER: 'background: var(--muted); color: var(--foreground); border: 1px solid var(--muted);',
    BREAK: 'background: var(--bg-surface-2, var(--muted)); color: var(--muted-foreground); border: 1px solid var(--border);',
  };

  // ── Variant 1: Timeline Vertical ──────────────────────────────────────────
  bm.add('agenda-timeline', {
    label: card(icon('<line x1="3" y1="12" x2="21" y2="12"/><polyline points="3 6 9 12 3 18"/>'), 'Agenda Timeline'),
    category: 'Program & Agenda',
    content: `
      <section data-gjs-type="agenda" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 860px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 56px;">
            <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">Conference Schedule</p>
            <h2 style="font-size: 42px; font-weight: 900; color: var(--foreground); margin: 0 0 12px 0; letter-spacing: -0.02em;">Program Agenda</h2>
          </div>
          ${days.map((day, di) => `
            <div style="margin-bottom: 48px;">
              <h3 style="font-size: 18px; font-weight: 800; color: var(--pri, var(--primary)); margin: 0 0 24px 0; padding: 10px 16px; background: color-mix(in srgb, var(--primary) 10%, transparent); border-left: 3px solid var(--pri, var(--primary)); border-radius: 0 8px 8px 0;">
                Day ${di + 1} · ${new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <div style="display: flex; flex-direction: column; gap: 0; position: relative;">
                <div style="position: absolute; left: 72px; top: 0; bottom: 0; width: 1px; background: var(--muted);"></div>
                ${day.sessions.map(sess => `
                  <div style="display: flex; gap: 20px; padding: 16px 0; position: relative;">
                    <div style="width: 64px; flex-shrink: 0; text-align: right;">
                      <div style="font-size: 13px; font-weight: 700; color: var(--muted-foreground); line-height: 1.3; font-variant-numeric: tabular-nums;">${sess.startTime}</div>
                      <div style="font-size: 11px; color: var(--muted-foreground); margin-top: 2px;">${sess.endTime}</div>
                    </div>
                    <div style="width: 16px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; padding-top: 4px;">
                      <div style="width: 10px; height: 10px; border-radius: 50%; background: ${sess.sessionType === 'BREAK' ? 'var(--border-strong, var(--muted))' : 'var(--pri, var(--primary))'}; border: 2px solid ${sess.sessionType === 'BREAK' ? 'var(--border-default, var(--muted))' : 'var(--muted)'}; flex-shrink: 0; position: relative; z-index: 1;"></div>
                    </div>
                    <div style="flex: 1; min-width: 0; padding-bottom: 16px; ${sess.sessionType !== 'BREAK' ? 'background: var(--muted); border: 1px solid var(--border-subtle, var(--muted)); border-radius: 12px; padding: 14px 18px;' : 'padding: 4px 0;'}">
                      <div style="display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; margin-bottom: ${sess.sessionType !== 'BREAK' ? '4px' : '0'};">
                        <span style="font-size: 15px; font-weight: ${sess.sessionType === 'BREAK' ? '500' : '700'}; color: ${sess.sessionType === 'BREAK' ? 'var(--muted-foreground)' : 'var(--foreground)'}; flex: 1;">${sess.title}</span>
                        ${sess.sessionType !== 'BREAK' ? `<span style="padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; ${sessionTypeBadge[sess.sessionType] || sessionTypeBadge.TALK}">${sess.sessionType}</span>` : ''}
                      </div>
                      ${sess.sessionType !== 'BREAK' ? `<div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--muted-foreground);">${sess.room ? `<span>📍 ${sess.room}</span>` : ''}${sess.chair ? `<span>🎙️ Chair: ${sess.chair}</span>` : ''}${sess.track ? `<span>🏷️ ${sess.track}</span>` : ''}</div>` : ''}
                    </div>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </section>`,
  });

  // ── Variant 2: Daily Tabs ─────────────────────────────────────────────────
  bm.add('agenda-daily-tabs', {
    label: card(icon('<rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="12" width="18" height="9" rx="1"/>'), 'Agenda by Day'),
    category: 'Program & Agenda',
    content: `
      <section data-gjs-type="agenda" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 900px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 48px;">
            <h2 style="font-size: 42px; font-weight: 900; color: var(--foreground); margin: 0 0 8px 0; letter-spacing: -0.02em;">Conference Schedule</h2>
            <p style="font-size: 16px; color: var(--muted-foreground);">Three days of groundbreaking sessions, workshops, and networking</p>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 32px; border-bottom: 1px solid var(--border); padding-bottom: 1px; overflow-x: auto;">
            ${days.map((day, i) => `
              <div style="padding: 10px 20px; font-size: 14px; font-weight: 700; color: ${i === 0 ? 'var(--foreground)' : 'var(--muted-foreground)'}; border-bottom: 2px solid ${i === 0 ? 'var(--pri, var(--primary))' : 'transparent'}; white-space: nowrap; cursor: pointer; transition: all 0.2s;">
                Day ${i + 1} · ${new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>`).join('')}
          </div>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${(days[0]?.sessions || []).map(sess => `
              <div style="display: flex; gap: 20px; background: ${sess.sessionType === 'BREAK' ? 'transparent' : 'var(--muted)'}; border: ${sess.sessionType === 'BREAK' ? 'none' : '1px solid var(--muted)'}; border-radius: 14px; padding: ${sess.sessionType === 'BREAK' ? '8px 0' : '18px 20px'}; align-items: flex-start; box-sizing: border-box;">
                <div style="width: 80px; flex-shrink: 0;">
                  <div style="font-size: 14px; font-weight: 700; color: var(--muted-foreground); font-variant-numeric: tabular-nums;">${sess.startTime}</div>
                  <div style="font-size: 11px; color: var(--muted-foreground); margin-top: 1px;">${sess.endTime}</div>
                </div>
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                    <span style="font-size: 15px; font-weight: ${sess.sessionType === 'BREAK' ? '500' : '700'}; color: ${sess.sessionType === 'BREAK' ? 'var(--muted-foreground)' : 'var(--foreground)'}; flex: 1;">${sess.title}</span>
                    ${sess.sessionType !== 'BREAK' ? `<span style="padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; ${sessionTypeBadge[sess.sessionType] || sessionTypeBadge.TALK}">${sess.sessionType}</span>` : ''}
                  </div>
                  ${sess.sessionType !== 'BREAK' && sess.room ? `<div style="font-size: 12px; color: var(--muted-foreground); margin-top: 6px;">📍 ${sess.room}${sess.chair ? ` · 🎙️ ${sess.chair}` : ''}</div>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });

  // ── Variant 3: Cards Grid ─────────────────────────────────────────────────
  bm.add('agenda-cards', {
    label: card(icon('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 8h10M7 12h7"/>'), 'Agenda Cards'),
    category: 'Program & Agenda',
    content: `
      <section data-gjs-type="agenda" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1100px; margin: 0 auto;">
          <h2 style="font-size: 38px; font-weight: 900; color: var(--foreground); margin: 0 0 40px 0; letter-spacing: -0.02em; text-align: center;">Featured Sessions</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
            ${days.flatMap(d => d.sessions).filter(s => s.sessionType !== 'BREAK').slice(0, 6).map(sess => `
              <div style="background: var(--muted); border: 1px solid var(--border); border-radius: 18px; padding: 24px; display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; transition: all 0.2s; cursor: pointer;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                  <span style="padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; ${sessionTypeBadge[sess.sessionType] || sessionTypeBadge.TALK}">${sess.sessionType}</span>
                  ${sess.track ? `<span style="font-size: 11px; color: var(--muted-foreground); font-weight: 600;">${sess.track}</span>` : ''}
                </div>
                <h4 style="font-size: 16px; font-weight: 700; color: var(--foreground); margin: 0; line-height: 1.4;">${sess.title}</h4>
                <div style="display: flex; gap: 12px; font-size: 12px; color: var(--muted-foreground); flex-wrap: wrap; margin-top: auto;">
                  <span>⏰ ${sess.startTime}–${sess.endTime}</span>
                  ${sess.room ? `<span>📍 ${sess.room}</span>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });
}
